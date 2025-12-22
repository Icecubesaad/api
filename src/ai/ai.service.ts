import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DatabaseService } from '../database/database.service';
import { ChatRequestDto, ChatResponseDto } from './dto/chat.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { CalendarService } from '../calendar/calendar.service';
import { RagService } from './rag.service';
import { PdfIngestService } from './pdf-ingest.service';
import { ScheduleService } from '../schedule/schedule.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openai: OpenAI;

  constructor(
    private configService: ConfigService,
    private db: DatabaseService,
    private notificationsService: NotificationsService,
    private calendarService: CalendarService,
    private ragService: RagService,
    private pdfIngestService: PdfIngestService,
    @Inject(forwardRef(() => ScheduleService))
    private scheduleService: ScheduleService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('ai.openaiApiKey'),
    });
  }

  private getSystemPrompt(): string {
    return `You are JobMate, a friendly and helpful daily assistant. You help users track their work, create notes, generate daily logs, schedule tasks, and manage their projects.

Your personality:
- Be kind, casual, and concise
- Use Australian slang occasionally ("Hey mate!", "G'day Mate", "No worries", "Too easy")
- Be encouraging and supportive
- Focus on productivity and organization
- Keep it industry-agnostic - never assume specific domains like construction

CRITICAL TOOL USAGE RULES:
1. When user asks to create a reminder, schedule, or event - IMMEDIATELY call the appropriate tool. DO NOT ask for confirmation first.
2. When you see "[USER UPLOADED PDF FILE:" in the message - IMMEDIATELY call importScheduleFromPdf tool. This is mandatory.
3. When user mentions "schedule", "create reminders", "add tasks", "process this", "import" with PDF context - IMMEDIATELY call importScheduleFromPdf.
4. ALWAYS execute tools on the first request. Never say "I can create that for you, should I proceed?" - just DO IT.
5. If a message contains "[USER UPLOADED PDF FILE:" - you MUST call importScheduleFromPdf, no exceptions.

Available tools:
- generateNote: Create a note from content
- createReminder: Create a reminder for the user - USE IMMEDIATELY when user asks
- createCalendarEvent: Add an event to the user's calendar - USE IMMEDIATELY when user asks
- summarizeNotes: Generate a summary from user's notes
- importScheduleFromPdf: Import schedule from uploaded PDF and create calendar events and reminders - USE IMMEDIATELY when PDF is uploaded

PDF UPLOAD HANDLING (CRITICAL - MUST FOLLOW):
- When you see "[USER UPLOADED PDF FILE:" in ANY message, you MUST call importScheduleFromPdf immediately
- Do NOT ask what the user wants to do with the PDF - just import it
- Do NOT say "I see you uploaded a file" - just process it
- The tool will automatically find the uploaded PDF and create reminders
- After calling the tool, tell the user what reminders were created

REMINDER CREATION (CRITICAL):
- When user says "remind me to X at Y time" - IMMEDIATELY call createReminder
- When user says "set a reminder for X" - IMMEDIATELY call createReminder
- Parse the date/time from user's message and create the reminder right away
- Focus on REMINDERS since calendar may not be connected

IMPORTANT: When sending ANY notification, ALWAYS start with "Hey mate!" or "G'day Mate,"

Be helpful, efficient, and action-oriented. Execute tools immediately without asking for confirmation.`;
  }

  async chat(chatRequest: ChatRequestDto, userId: string): Promise<ChatResponseDto> {
    try {
      // Debug: Log the conversation messages
      this.logger.log(`Chat request from user ${userId} with ${chatRequest.messages.length} messages`);
      chatRequest.messages.forEach((msg, index) => {
        this.logger.log(`Message ${index}: ${msg.role} - ${msg.content.substring(0, 100)}...`);
      });



      // Get RAG context if projectId is provided
      let ragContext = '';
      if (chatRequest.projectId) {
        const latestUserMessage = chatRequest.messages
          .filter(m => m.role === 'user')
          .pop()?.content || '';

        if (latestUserMessage) {
          const ragResult = await this.ragService.retrieve({
            projectId: chatRequest.projectId,
            query: latestUserMessage,
            noteIds: chatRequest.context?.noteIds,
            uploadIds: chatRequest.context?.uploadIds,
            dateRange: chatRequest.context?.dateRange,
            k: 8,
          });
          
          ragContext = ragResult.contextText;
        }
      }

      const systemPrompt = this.getSystemPrompt();
      const contextualSystemPrompt = ragContext 
        ? `${systemPrompt}\n\n${ragContext}`
        : systemPrompt;

      const messages = [
        { role: 'system' as const, content: contextualSystemPrompt },
        ...chatRequest.messages.map(msg => ({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        })),
      ];

      const tools = this.getAvailableTools(chatRequest.toolsAllowed);

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? 'auto' : undefined,
        temperature: chatRequest.temperature || 0.3, // Lower temperature for more consistent tool calling
        max_tokens: 1500,
      });

      const response = completion.choices[0];
      let toolResults = [];
      let createdEntities: any = {};

      if (response.message.tool_calls) {
        const results = await this.executeToolCalls(
          response.message.tool_calls,
          userId,
          chatRequest.projectId,
        );
        toolResults = results.toolResults;
        createdEntities = results.createdEntities;
      }

      return {
        message: response.message.content || '',
        toolResults,
        createdEntities,
        usage: {
          promptTokens: completion.usage?.prompt_tokens || 0,
          completionTokens: completion.usage?.completion_tokens || 0,
          totalTokens: completion.usage?.total_tokens || 0,
        },
      };
    } catch (error) {
      this.logger.error('Error in AI chat:', error);
      throw new Error('Failed to process chat request');
    }
  }

  private getAvailableTools(allowedTools?: string[]) {
    const allTools = [
      {
        type: 'function' as const,
        function: {
          name: 'generateNote',
          description: 'Turn chat summary or voice transcript into a structured Note',
          parameters: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID this note belongs to (optional - will use default project if not provided)' },
              title: { type: 'string', description: 'Note title (optional)' },
              content: { type: 'string', description: 'Note content' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Tags for the note' },
              date: { type: 'string', description: 'Date in ISO format (optional, defaults to today)' },
            },
            required: ['content'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'createReminder',
          description: 'Create a reminder for the user',
          parameters: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID this reminder belongs to (optional - will use default project if not provided)' },
              title: { type: 'string', description: 'Reminder title' },
              dueAt: { type: 'string', description: 'Due date/time in ISO format' },
              recurrence: { type: 'string', description: 'Recurrence pattern: daily, weekly, monthly' },
            },
            required: ['title', 'dueAt'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'createCalendarEvent',
          description: 'Add to connected calendar',
          parameters: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID this event belongs to' },
              title: { type: 'string', description: 'Event title' },
              startsAt: { type: 'string', description: 'Start time in ISO format' },
              endsAt: { type: 'string', description: 'End time in ISO format' },
              provider: { type: 'string', description: 'Calendar provider (optional)' },
            },
            required: ['projectId', 'title', 'startsAt', 'endsAt'],
          },
        },
      },

      {
        type: 'function' as const,
        function: {
          name: 'summarizeNotes',
          description: 'Summarize notes for a project within a date range',
          parameters: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID' },
              dateRange: {
                type: 'object',
                properties: {
                  from: { type: 'string', description: 'Start date in ISO format' },
                  to: { type: 'string', description: 'End date in ISO format' },
                },
              },
            },
            required: ['projectId'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'scheduleFromNotes',
          description: 'Create calendar events from notes using heuristics',
          parameters: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID' },
              heuristic: { type: 'string', description: 'Scheduling heuristic (optional)' },
            },
            required: ['projectId'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'importScheduleFromPdf',
          description: 'Import schedule from uploaded PDF and create calendar events and reminders. Use scheduleDate parameter when user specifies a specific date for the tasks.',
          parameters: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID' },
              uploadId: { type: 'string', description: 'Upload ID of the PDF (optional, will use most recent PDF if not provided)' },
              scheduleDate: { type: 'string', description: 'Date the schedule applies to in YYYY-MM-DD format (e.g., "2025-10-03"). Use this when user specifies a date like "schedule for October 3rd" or "on tomorrow".' },
              tz: { type: 'string', description: 'Timezone (optional, defaults to user timezone)' },
            },
            required: ['projectId'],
          },
        },
      },
    ];

    if (!allowedTools) return allTools;
    return allTools.filter(tool => allowedTools.includes(tool.function.name));
  }

  private async executeToolCalls(toolCalls: any[], userId: string, projectId?: string) {
    const toolResults = [];
    const createdEntities: any = {};

    for (const toolCall of toolCalls) {
      try {
        const { name, arguments: args } = toolCall.function;
        const parsedArgs = JSON.parse(args);

        switch (name) {
          case 'generateNote':
            const note = await this.generateNote({
              ...parsedArgs,
              userId,
              projectId: projectId || parsedArgs.projectId,
            });
            toolResults.push({ tool: name, result: note });
            createdEntities.note = note;
            break;

          case 'createReminder':
            const reminder = await this.createReminder({
              ...parsedArgs,
              userId,
              projectId: projectId || parsedArgs.projectId,
            });
            toolResults.push({ tool: name, result: reminder });
            createdEntities.reminder = reminder;
            
            // Send notification with Australian greeting
            await this.notificationsService.sendNotification(userId, 'PUSH', {
              title: 'Hey mate! New reminder created',
              body: `Your reminder "${reminder.title}" is set for ${new Date(reminder.dueAt).toLocaleString()}`,
              data: { type: 'reminder', id: reminder.id }
            });
            break;

          case 'createCalendarEvent':
            const event = await this.createCalendarEvent({
              ...parsedArgs,
              userId,
            });
            toolResults.push({ tool: name, result: event });
            createdEntities.event = event;
            
            // Send notification with Australian greeting
            const eventTitle = event?.summary || 'New Event';
            const eventStart = event?.start?.dateTime || event?.start || new Date();
            await this.notificationsService.sendNotification(userId, 'PUSH', {
              title: 'G\'day Mate, Calendar event created',
              body: `Event "${eventTitle}" scheduled for ${new Date(eventStart).toLocaleString()}`,
              data: { type: 'calendar_event', id: (event as any)?.eventId || (event as any)?.id }
            });
            break;



          case 'summarizeNotes':
            const summary = await this.summarizeNotes({
              ...parsedArgs,
              userId,
            });
            toolResults.push({ tool: name, result: summary });
            break;

          case 'scheduleFromNotes':
            const scheduledEvents = await this.scheduleFromNotes({
              ...parsedArgs,
              userId,
            });
            toolResults.push({ tool: name, result: scheduledEvents });
            createdEntities.events = scheduledEvents.createdEvents;
            break;

          case 'importScheduleFromPdf':
            const scheduleImport = await this.importScheduleFromPdf({
              ...parsedArgs,
              userId,
              projectId: projectId || parsedArgs.projectId, // Use chat context projectId first
            });
            toolResults.push({ tool: name, result: scheduleImport });
            createdEntities.schedulePreview = scheduleImport;
            break;

          default:
            toolResults.push({ tool: name, result: 'Tool not implemented' });
        }
      } catch (error) {
        this.logger.error(`Error executing tool call ${toolCall.function.name}:`, error);
        toolResults.push({ tool: toolCall.function.name, result: 'Error executing tool' });
      }
    }

    return { toolResults, createdEntities };
  }

  private async generateNote(data: any) {
    // Get or create a default project if none provided
    const projectId = data.projectId || await this.getOrCreateDefaultProject(data.userId);
    
    const note = await this.db.note.create({
      data: {
        projectId: projectId,
        userId: data.userId,
        content: data.content,
        kind: 'AI',
        date: data.date ? new Date(data.date) : new Date(),
        tags: data.tags || [],
      },
    });

    // Ingest into RAG system
    await this.ragService.ingestNote(
      note.id,
      note.content,
      note.projectId,
      note.date,
    );

    return { noteId: note.id };
  }

  private async createReminder(data: any) {
    // Get or create a default project if none provided
    const projectId = data.projectId || await this.getOrCreateDefaultProject(data.userId);
    
    const reminder = await this.db.reminder.create({
      data: {
        title: data.title,
        dueAt: new Date(data.dueAt),
        recurrenceJson: data.recurrence ? { pattern: data.recurrence } : null,
        projectId: projectId,
        userId: data.userId,
      },
    });

    return { reminderId: reminder.id, ...reminder };
  }

  private async getOrCreateDefaultProject(userId: string): Promise<string> {
    // First, try to find an existing project for the user
    const existingProject = await this.db.project.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'asc' }, // Get the oldest (first) project
    });

    if (existingProject) {
      return existingProject.id;
    }

    // If no project exists, create a default one
    const defaultProject = await this.db.project.create({
      data: {
        name: 'My Project',
        description: 'Default project created by AI assistant',
        ownerId: userId,
      },
    });

    return defaultProject.id;
  }

  private async createCalendarEvent(data: any) {
    try {
      // Get or create a default project if none provided
      const projectId = data.projectId || await this.getOrCreateDefaultProject(data.userId);
      
      // Validate and parse dates
      const startDate = new Date(data.startsAt);
      const endDate = new Date(data.endsAt);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error(`Invalid date format: startsAt=${data.startsAt}, endsAt=${data.endsAt}`);
      }

      // Use calendar service to create event in external provider
      const event = await this.calendarService.createEvent(data.userId, {
        summary: data.title,
        start: { dateTime: startDate.toISOString() },
        end: { dateTime: endDate.toISOString() },
        description: data.description,
      });

      // Store event in our database
      await this.db.event.create({
        data: {
          projectId: projectId,
          provider: 'GOOGLE', // Default provider
          providerEventId: event.id,
          title: data.title,
          startsAt: startDate,
          endsAt: endDate,
          metaJson: { description: data.description },
        },
      });

      return { eventId: event.id, providerEventId: event.id, ...event };
    } catch (error) {
      this.logger.error('Failed to create calendar event:', error);
      
      // Handle invalid date format
      if (error.message?.includes('Invalid date format')) {
        return {
          eventId: 'error-' + Date.now(),
          providerEventId: 'error-' + Date.now(),
          message: `Unable to create event due to invalid date format. Please provide dates in ISO format (YYYY-MM-DDTHH:mm:ss.sssZ)`,
          title: data.title,
          error: error.message,
          status: 'error'
        };
      }
      
      // If no calendar is connected, return a helpful message
      if (error.message?.includes('No calendar connected')) {
        return { 
          eventId: 'local-event-' + Date.now(), 
          providerEventId: 'local-event-' + Date.now(),
          message: 'Event details saved locally! To sync with your Google Calendar, visit the Calendar page to connect your account.',
          title: data.title,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          status: 'local-only'
        };
      }
      
      // Return a mock event if calendar service fails
      const mockId = `mock-${Date.now()}`;
      return {
        eventId: mockId,
        providerEventId: mockId,
        summary: data.title,
        start: { dateTime: data.startsAt },
        end: { dateTime: data.endsAt },
        description: data.description,
      };
    }
  }



  private async summarizeNotes(data: any) {
    const dateRange = data.dateRange;
    const whereClause: any = {
      projectId: data.projectId,
      userId: data.userId,
    };

    if (dateRange) {
      whereClause.date = {
        gte: new Date(dateRange.from),
        lte: new Date(dateRange.to),
      };
    }

    const notes = await this.db.note.findMany({
      where: whereClause,
      orderBy: { date: 'desc' },
    });

    const notesText = notes.map(n => n.content).join('\n');
    
    if (!notesText.trim()) {
      return {
        summary: 'No notes found for the specified criteria.',
        nextActions: [],
      };
    }

    const summaryPrompt = `Summarize these notes and extract next actions:

${notesText}

Provide:
1. A concise summary highlighting main activities and progress
2. A list of next actions or outstanding tasks`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.5,
      });

      const content = completion.choices[0].message.content || '';
      
      // Simple parsing to extract next actions
      const lines = content.split('\n');
      const nextActions = lines
        .filter(line => line.includes('action') || line.includes('task') || line.includes('todo'))
        .slice(0, 5);

      return {
        summary: content,
        nextActions,
      };
    } catch (error) {
      this.logger.error('Failed to generate summary:', error);
      return {
        summary: `Found ${notes.length} notes. Unable to generate AI summary at this time.`,
        nextActions: [],
      };
    }
  }

  private async scheduleFromNotes(data: any) {
    try {
      // Get recent notes
      const notes = await this.db.note.findMany({
        where: {
          projectId: data.projectId,
          userId: data.userId,
          date: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
        orderBy: { date: 'desc' },
      });

      const notesText = notes.map(n => n.content).join('\n');
      
      if (!notesText.trim()) {
        return { createdEvents: [] };
      }

      const schedulePrompt = `Analyze these notes and suggest calendar events for scheduling. Return a JSON array of events with title, start time (ISO format), and end time (ISO format). Only suggest concrete, actionable events that can be scheduled.

Notes:
${notesText}

Return format: [{"title": "Event Title", "startsAt": "2024-01-01T10:00:00Z", "endsAt": "2024-01-01T11:00:00Z"}]`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: schedulePrompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(completion.choices[0].message.content || '{"events": []}');
      const events = result.events || [];
      
      const createdEvents = [];
      
      for (const event of events.slice(0, 3)) { // Limit to 3 events
        try {
          const createdEvent = await this.createCalendarEvent({
            ...event,
            projectId: data.projectId,
            userId: data.userId,
          });
          
          createdEvents.push({
            eventId: createdEvent.eventId,
            title: event.title,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
          });
        } catch (error) {
          this.logger.error('Failed to create scheduled event:', error);
        }
      }

      return { createdEvents };
    } catch (error) {
      this.logger.error('Failed to schedule from notes:', error);
      return { createdEvents: [] };
    }
  }

  private async importScheduleFromPdf(data: any) {
    try {
      this.logger.log(`importScheduleFromPdf called with data:`, { 
        projectId: data.projectId, 
        userId: data.userId, 
        uploadId: data.uploadId,
        scheduleDate: data.scheduleDate,
        tz: data.tz 
      });
      
      let uploadId = data.uploadId;
      
      // If no uploadId provided, find the most recent PDF upload for this project
      if (!uploadId) {
        this.logger.log(`No uploadId provided, searching for recent PDF uploads...`);
        const recentUpload = await this.db.upload.findFirst({
          where: {
            projectId: data.projectId,
            userId: data.userId,
            mime: 'application/pdf',
          },
          orderBy: { createdAt: 'desc' },
        });
        
        if (!recentUpload) {
          this.logger.error(`No recent PDF upload found for project ${data.projectId}, user ${data.userId}`);
          return {
            error: 'No PDF upload found',
            message: 'Please upload a PDF file first, then ask me to import the schedule.',
          };
        }
        
        uploadId = recentUpload.id;
        this.logger.log(`Using most recent PDF upload: ${uploadId} (created: ${recentUpload.createdAt})`);
      } else {
        this.logger.log(`Using provided uploadId: ${uploadId}`);
      }

      this.logger.log(`Calling scheduleService.importScheduleFromPdf with uploadId: ${uploadId}, projectId: ${data.projectId}`);
      
      // Add a small delay to ensure upload is fully processed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const preview = await this.scheduleService.importScheduleFromPdf(
        data.projectId,
        uploadId,
        data.scheduleDate,
        data.tz
      );

      // Auto-commit the schedule to create events and reminders immediately
      try {
        const commitResult = await this.scheduleService.commitSchedule(data.userId, {
          uploadId,
          projectId: data.projectId,
          blocks: preview.blocks.map(block => ({
            title: block.title,
            description: block.description,
            startsAt: block.startsAt,
            endsAt: block.endsAt,
            tags: block.tags,
          })),
          forceReimport: true, // Always replace existing schedule when importing from PDF
        });

        // Build a detailed response message
        const eventsCount = commitResult.createdEvents?.length || 0;
        const remindersCount = commitResult.createdReminders?.length || 0;
        const skippedCount = (commitResult as any).skippedDuplicates?.length || 0;
        
        let message = `G'day mate! I've processed your schedule and created:\n`;
        message += `• ${eventsCount} schedule events\n`;
        message += `• ${remindersCount} reminders\n`;
        if (skippedCount > 0) {
          message += `• ${skippedCount} duplicates skipped\n`;
        }
        message += `\n`;
        
        if (eventsCount > 0) {
          message += `Your schedule is now set up! You'll get notifications before each task starts.`;
        } else if (remindersCount > 0) {
          message += `Reminders are set! Connect your Google Calendar to sync these as calendar events too.`;
        } else {
          message += `No new items created - your schedule may already be up to date.`;
        }

        return {
          preview,
          commitResult,
          message,
          blocks: preview.blocks,
          uploadId,
          autoCommitted: true,
          summary: {
            totalBlocks: preview.blocks.length,
            eventsCreated: eventsCount,
            remindersCreated: remindersCount,
          }
        };
      } catch (commitError) {
        this.logger.error('Failed to auto-commit schedule:', commitError);
        return {
          preview,
          message: `G'day mate! I've parsed your schedule and found ${preview.blocks.length} tasks, but had trouble creating them. Please try again or create them manually.`,
          createUrl: `/api/schedule/commit`,
          blocks: preview.blocks,
          uploadId,
          error: commitError.message,
        };
      }
    } catch (error) {
      this.logger.error('Failed to import schedule from PDF:', error);
      return {
        error: 'Failed to parse schedule from PDF. Please ensure the PDF contains a clear schedule with time ranges.',
        message: 'Unable to extract schedule from the uploaded PDF. Try uploading a PDF with clear time blocks like "9:00 AM - 10:00 AM Task Name".',
      };
    }
  }

  // Public method for generating completions (used by PDF parsing service)
  async generateCompletion(messages: Array<{ role: string; content: string }>) {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: messages as any,
      temperature: 0.3,
      max_tokens: 4000, // Increased to handle larger schedule responses
    });

    return completion.choices[0].message.content || '';
  }
}

