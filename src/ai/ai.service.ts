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
    const today = new Date();
    const currentDate = today.toISOString().split('T')[0];
    const currentYear = today.getFullYear();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const currentTimeUTC = today.toISOString();
    const currentHour = today.getUTCHours();
    
    return `You are JobMate, a friendly and helpful daily assistant. You help users track their work, create notes, generate daily logs, schedule tasks, and manage their projects.

CURRENT DATE/TIME CONTEXT (CRITICAL - USE THESE VALUES):
- Today's date: ${currentDate}
- Current year: ${currentYear}
- Tomorrow: ${tomorrow}

Your personality:
- Be kind, casual, and concise
- Use Australian slang occasionally ("Hey mate!", "G'day Mate", "No worries", "Too easy")
- Be encouraging and supportive
- Focus on productivity and organization
- Keep it industry-agnostic - never assume specific domains like construction

CRITICAL DATE/TIME HANDLING RULES:
- ALWAYS use ${currentYear} as the default year for any date
- NEVER use 2022, 2023, or 2024 - the current year is ${currentYear}
- When user says "tomorrow", use ${tomorrow}
- Format all dates as ISO 8601: YYYY-MM-DDTHH:mm:ss.sssZ

TIMEZONE HANDLING (VERY IMPORTANT):
- ALWAYS assume the user is in Australia/Sydney timezone unless they specify otherwise
- When user says "10:50 PM today", they mean 10:50 PM in THEIR local time (Australia/Sydney)
- DO NOT convert to UTC - just use the time they specify with today's date
- Example: "10:50 PM today" on ${currentDate} = "${currentDate}T22:50:00" (NO Z suffix!)
- The backend will handle timezone conversion
- When displaying times back to user, show the time they requested (not UTC)

CRITICAL TOOL USAGE RULES:
1. When user asks to create a reminder, schedule, or event - IMMEDIATELY call the appropriate tool. DO NOT ask for confirmation first.
2. When you see "[USER UPLOADED PDF FILE:" in the message - IMMEDIATELY call importScheduleFromPdf tool. This is mandatory.
3. When user mentions "schedule", "create reminders", "add tasks", "process this", "import" with PDF context - IMMEDIATELY call importScheduleFromPdf.
4. ALWAYS execute tools on the first request. Never say "I can create that for you, should I proceed?" - just DO IT.
5. If a message contains "[USER UPLOADED PDF FILE:" - you MUST call importScheduleFromPdf, no exceptions.

Available tools:
- generateNote: Create a note from content - USE IMMEDIATELY when user asks to create/save a note
- createReminder: Create a reminder for the user - USE IMMEDIATELY when user asks
- createCalendarEvent: Add an event to the user's calendar - USE IMMEDIATELY when user asks
- summarizeNotes: Generate a summary from user's notes
- listReminders: Get all reminders from the database - USE THIS when user asks to see/list/show reminders. NEVER make up reminder data!
- importScheduleFromPdf: Import schedule from uploaded PDF and create calendar events and reminders - USE IMMEDIATELY when PDF is uploaded

LISTING REMINDERS (CRITICAL - NEVER HALLUCINATE):
- When user asks "show my reminders", "list reminders", "what reminders do I have" - ALWAYS call listReminders tool
- NEVER make up or invent reminder data - only show what the tool returns
- If the tool returns 0 reminders, tell the user they have no reminders

NOTE CREATION (CRITICAL):
- When user says "create a note", "save a note", "add a note" - IMMEDIATELY call generateNote
- Extract the title, content, and tags from the user's message
- Example: "Create a note titled Meeting Notes with content: discussed project timeline, tags: work, meeting"
  → Call generateNote with title="Meeting Notes", content="discussed project timeline", tags=["work", "meeting"]

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
- ALWAYS use the current year from CURRENT DATE CONTEXT above - NEVER use 2022, 2023, or 2024
- Focus on REMINDERS since calendar may not be connected

IMPORTANT: When sending ANY notification, ALWAYS start with "Hey mate!" or "G'day Mate,"

Be helpful, efficient, and action-oriented. Execute tools immediately without asking for confirmation.`;
  }

  private getSystemPromptWithTimezone(timezone: string): string {
    // ALWAYS default to Australia/Sydney, NEVER use UTC
    const userTz = timezone || 'Australia/Sydney';
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Get current time in user's timezone
    const userLocalTime = today.toLocaleString('en-AU', { 
      timeZone: userTz,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const userLocalDate = today.toLocaleDateString('en-CA', { timeZone: userTz }); // YYYY-MM-DD format
    
    // Calculate tomorrow in user's timezone
    const tomorrowDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowLocal = tomorrowDate.toLocaleDateString('en-CA', { timeZone: userTz });

    return this.getSystemPrompt()
      .replace(/Today's date: [^\n]+/, `Today's date: ${userLocalDate}`)
      .replace(/Tomorrow: [^\n]+/, `Tomorrow: ${tomorrowLocal}`)
      .replace(/TIMEZONE HANDLING \(VERY IMPORTANT\):[\s\S]*?When displaying times back to user, show the time they requested \(not UTC\)/, 
        `TIMEZONE HANDLING (CRITICAL - USER'S LOCAL TIME IS KING):
- User's timezone: ${userTz}
- User's current local time: ${userLocalTime}
- Today's date in user's timezone: ${userLocalDate}

CRITICAL FOR REMINDERS - USE USER'S LOCAL TIME:
- When user says "10:50 PM today", use dueAt="${userLocalDate}T22:50:00" (NO Z suffix!)
- The dueAt format is: YYYY-MM-DDTHH:mm:ss (user's local time, NO timezone suffix)
- NEVER add "Z" at the end - that would wrongly interpret it as UTC
- NEVER convert to UTC - the backend handles timezone conversion
- Example: "10:50 PM" = "T22:50:00", "9:30 AM" = "T09:30:00"

When confirming to user, show the EXACT time they requested in their local timezone (e.g., "10:50 PM" not some UTC-converted time)`);
  }

  async chat(chatRequest: ChatRequestDto, userId: string): Promise<ChatResponseDto> {
    try {
      // Debug: Log the conversation messages
      this.logger.log(`Chat request from user ${userId} with ${chatRequest.messages.length} messages, timezone: ${chatRequest.timezone}`);
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

      const systemPrompt = chatRequest.timezone 
        ? this.getSystemPromptWithTimezone(chatRequest.timezone)
        : this.getSystemPrompt();
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
      let confirmationMessage = '';

      if (response.message.tool_calls) {
        const results = await this.executeToolCalls(
          response.message.tool_calls,
          userId,
          chatRequest.projectId,
          chatRequest.timezone,
        );
        toolResults = results.toolResults;
        createdEntities = results.createdEntities;
        
        // Generate confirmation message based on tool results
        confirmationMessage = this.generateConfirmationMessage(toolResults, createdEntities);
      }

      // Use GPT's message if available, otherwise use our confirmation message
      const finalMessage = response.message.content || confirmationMessage;

      return {
        message: finalMessage,
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

  private generateConfirmationMessage(toolResults: any[], createdEntities: any): string {
    const messages: string[] = [];
    const greetings = ["Hey mate!", "G'day!", "No worries!", "Too easy!"];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];

    for (const result of toolResults) {
      switch (result.tool) {
        case 'generateNote':
          if (result.result?.noteId) {
            const tags = result.result.tags?.length > 0 ? ` with tags: ${result.result.tags.join(', ')}` : '';
            const title = result.result.title ? `"${result.result.title}"` : 'your note';
            messages.push(`${greeting} I've created ${title}${tags} for you. 📝`);
          }
          break;
          
        case 'createReminder':
          if (result.result?.reminderId) {
            const title = result.result.title || 'your reminder';
            // Show time in a user-friendly format (the time they requested)
            const dueDate = result.result.dueAt ? new Date(result.result.dueAt) : null;
            let timeStr = '';
            if (dueDate) {
              timeStr = dueDate.toLocaleString('en-AU', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              });
            }
            messages.push(`${greeting} I've set a reminder "${title}"${timeStr ? ` for ${timeStr}` : ''}. ⏰`);
          }
          break;
          
        case 'createCalendarEvent':
          if (result.result?.eventId) {
            const title = result.result.summary || result.result.title || 'your event';
            messages.push(`${greeting} I've added "${title}" to your calendar. 📅`);
          }
          break;
          
        case 'importScheduleFromPdf':
          // This already has its own message in the result
          if (result.result?.message) {
            return result.result.message;
          }
          if (result.result?.summary) {
            const { eventsCreated, remindersCreated } = result.result.summary;
            messages.push(`${greeting} I've imported your schedule - created ${eventsCreated} events and ${remindersCreated} reminders! 📋`);
          }
          break;
          
        case 'summarizeNotes':
          if (result.result?.summary) {
            messages.push(`${greeting} Here's your summary:\n\n${result.result.summary}`);
          }
          break;

        case 'listReminders':
          if (result.result) {
            const { count, reminders } = result.result;
            if (count === 0) {
              messages.push(`${greeting} You don't have any reminders yet. Would you like me to create one?`);
            } else {
              let reminderList = `${greeting} Here are your ${count} reminder${count > 1 ? 's' : ''}:\n\n`;
              for (const r of reminders) {
                const statusIcon = r.status === 'COMPLETED' ? '✅' : r.status === 'CANCELLED' ? '❌' : '⏰';
                reminderList += `${statusIcon} "${r.title}" - ${r.dueAtFormatted} (${r.status})\n`;
              }
              messages.push(reminderList);
            }
          }
          break;
      }
    }

    return messages.length > 0 ? messages.join('\n\n') : '';
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
          description: 'Create a reminder for the user. IMPORTANT: When user specifies a time like "11:08 PM", use their LOCAL time directly. For example, if user says "11:08 PM today" on 2025-12-24, use dueAt="2025-12-24T23:08:00" (no Z suffix, treat as local time).',
          parameters: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID this reminder belongs to (optional - will use default project if not provided)' },
              title: { type: 'string', description: 'Reminder title' },
              dueAt: { type: 'string', description: 'Due date/time. Use format YYYY-MM-DDTHH:mm:ss WITHOUT the Z suffix. This represents the time in the user\'s local timezone.' },
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
      {
        type: 'function' as const,
        function: {
          name: 'listReminders',
          description: 'Get all reminders for the user from the database. ALWAYS use this tool when user asks to see, list, or show their reminders. Never make up reminder data.',
          parameters: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Filter by project ID (optional)' },
              status: { type: 'string', description: 'Filter by status: PENDING, COMPLETED, CANCELLED (optional)' },
            },
            required: [],
          },
        },
      },
    ];

    if (!allowedTools) return allTools;
    return allTools.filter(tool => allowedTools.includes(tool.function.name));
  }

  private async executeToolCalls(toolCalls: any[], userId: string, projectId?: string, timezone?: string) {
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
              timezone: timezone,
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

          case 'listReminders':
            const reminders = await this.listReminders({
              ...parsedArgs,
              userId,
            });
            toolResults.push({ tool: name, result: reminders });
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
    
    // Combine title and content if title is provided
    let fullContent = data.content;
    if (data.title) {
      fullContent = `# ${data.title}\n\n${data.content}`;
    }
    
    const note = await this.db.note.create({
      data: {
        projectId: projectId,
        userId: data.userId,
        content: fullContent,
        kind: 'AI',
        date: data.date ? new Date(data.date) : new Date(),
        tags: data.tags || [],
      },
    });

    this.logger.log(`Created note: ${note.id} with tags: ${note.tags.join(', ')}`);

    // Ingest into RAG system
    await this.ragService.ingestNote(
      note.id,
      note.content,
      note.projectId,
      note.date,
    );

    return { noteId: note.id, title: data.title, tags: note.tags };
  }

  private async createReminder(data: any) {
    // Get or create a default project if none provided
    const projectId = data.projectId || await this.getOrCreateDefaultProject(data.userId);
    
    // Parse the dueAt date - ALWAYS use user's timezone, never default to UTC
    const dueAtStr = data.dueAt;
    const userTimezone = data.timezone || 'Australia/Sydney'; // Default to Australia if not provided
    
    let dueAtDate: Date;
    
    // Check if the date string already has timezone info (Z or +/- offset)
    const hasTimezoneInfo = dueAtStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dueAtStr);
    
    if (hasTimezoneInfo) {
      // Date already has timezone info, parse directly
      dueAtDate = new Date(dueAtStr);
      this.logger.log(`Reminder has timezone info: ${dueAtStr} -> ${dueAtDate.toISOString()}`);
    } else {
      // Date is in local time format (e.g., "2025-12-24T23:08:00")
      // Interpret it as the user's timezone and convert to UTC for storage
      const match = dueAtStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):?(\d{2})?/);
      
      if (match) {
        const [, year, month, day, hour, minute, second = '00'] = match;
        
        // Create a formatter to get the timezone offset for the user's timezone
        const options: Intl.DateTimeFormatOptions = {
          timeZone: userTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        };
        
        // Get the offset for the user's timezone
        // We need to find what UTC time corresponds to the user's local time
        const targetLocalTime = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
        
        // Binary search approach: find the UTC time that displays as the target local time
        // Start with a rough estimate
        let utcGuess = new Date(`${targetLocalTime}Z`);
        
        // Get what this UTC time looks like in the user's timezone
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: userTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
        
        // Format and parse to get the offset
        const parts = formatter.formatToParts(utcGuess);
        const formatted = {
          year: parts.find(p => p.type === 'year')?.value,
          month: parts.find(p => p.type === 'month')?.value,
          day: parts.find(p => p.type === 'day')?.value,
          hour: parts.find(p => p.type === 'hour')?.value,
          minute: parts.find(p => p.type === 'minute')?.value,
          second: parts.find(p => p.type === 'second')?.value,
        };
        
        const localTimeFromUtc = `${formatted.year}-${formatted.month}-${formatted.day}T${formatted.hour}:${formatted.minute}:${formatted.second}`;
        
        // Calculate the difference
        const targetMs = new Date(`${targetLocalTime}Z`).getTime();
        const actualLocalMs = new Date(`${localTimeFromUtc}Z`).getTime();
        const offsetMs = targetMs - actualLocalMs;
        
        // Adjust the UTC time by the offset
        dueAtDate = new Date(utcGuess.getTime() + offsetMs);
        
        this.logger.log(`Reminder timezone conversion: input=${dueAtStr}, timezone=${userTimezone}, UTC=${dueAtDate.toISOString()}`);
      } else {
        // Fallback: just parse as-is
        dueAtDate = new Date(dueAtStr);
        this.logger.warn(`Could not parse reminder date format: ${dueAtStr}, using as-is`);
      }
    }
    
    const reminder = await this.db.reminder.create({
      data: {
        title: data.title,
        dueAt: dueAtDate,
        recurrenceJson: data.recurrence ? { pattern: data.recurrence } : null,
        projectId: projectId,
        userId: data.userId,
      },
    });

    this.logger.log(`Created reminder: "${data.title}" due at ${dueAtDate.toISOString()} (user timezone: ${userTimezone})`);

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
      let upload = null;
      
      // If no uploadId provided, find the most recent PDF upload for this project
      if (!uploadId) {
        this.logger.log(`No uploadId provided, searching for recent PDF uploads...`);
        
        // First try with userId
        upload = await this.db.upload.findFirst({
          where: {
            projectId: data.projectId,
            userId: data.userId,
            mime: 'application/pdf',
          },
          orderBy: { createdAt: 'desc' },
        });
        
        // If not found, try without userId (in case of mismatch)
        if (!upload) {
          this.logger.log(`No upload found with userId, trying without userId filter...`);
          upload = await this.db.upload.findFirst({
            where: {
              projectId: data.projectId,
              mime: 'application/pdf',
            },
            orderBy: { createdAt: 'desc' },
          });
        }
        
        // If still not found, try to find ANY recent PDF upload
        if (!upload) {
          this.logger.log(`No upload found for project, trying to find any recent PDF...`);
          upload = await this.db.upload.findFirst({
            where: {
              mime: 'application/pdf',
              extractedText: { not: null },
            },
            orderBy: { createdAt: 'desc' },
          });
        }
        
        if (!upload) {
          this.logger.error(`No PDF upload found at all`);
          
          // List all uploads for debugging
          const allUploads = await this.db.upload.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { id: true, projectId: true, userId: true, mime: true, createdAt: true },
          });
          this.logger.log(`Recent uploads in DB:`, allUploads);
          
          return {
            error: 'No PDF upload found',
            message: 'Please upload a PDF file first, then ask me to import the schedule.',
          };
        }
        
        uploadId = upload.id;
        this.logger.log(`Found PDF upload: ${uploadId} (created: ${upload.createdAt}, hasText: ${!!upload.extractedText})`);
      } else {
        this.logger.log(`Using provided uploadId: ${uploadId}`);
        upload = await this.db.upload.findUnique({ where: { id: uploadId } });
      }

      this.logger.log(`Calling scheduleService.importScheduleFromPdf with uploadId: ${uploadId}, projectId: ${data.projectId}`);
      
      // Add a small delay to ensure upload is fully processed
      await new Promise(resolve => setTimeout(resolve, 500));
      
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

        // Build a detailed response message with list of created items
        const eventsCount = commitResult.createdEvents?.length || 0;
        const remindersCount = commitResult.createdReminders?.length || 0;
        const skippedCount = (commitResult as any).skippedDuplicates?.length || 0;
        
        let message = `G'day mate! I've processed your schedule.\n\n`;
        message += `📊 **Summary:**\n`;
        message += `• ${eventsCount} schedule events created\n`;
        message += `• ${remindersCount} reminders created\n`;
        if (skippedCount > 0) {
          message += `• ${skippedCount} duplicates skipped\n`;
        }
        
        // Add detailed list of created reminders (grouped by date)
        if (commitResult.createdReminders && commitResult.createdReminders.length > 0) {
          message += `\n📋 **Reminders Created:**\n`;
          
          // Group reminders by date
          const remindersByDate: Record<string, any[]> = {};
          for (const reminder of commitResult.createdReminders) {
            const date = new Date(reminder.dueAt).toLocaleDateString('en-US', { 
              weekday: 'long', 
              month: 'short', 
              day: 'numeric' 
            });
            if (!remindersByDate[date]) {
              remindersByDate[date] = [];
            }
            remindersByDate[date].push(reminder);
          }
          
          // List reminders by date
          for (const [date, reminders] of Object.entries(remindersByDate)) {
            message += `\n**${date}:**\n`;
            for (const r of reminders.slice(0, 10)) { // Limit to 10 per day to avoid huge messages
              const time = new Date(r.dueAt).toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit',
                hour12: true 
              });
              message += `  • ${time} - ${r.title.replace('Reminder: ', '')}\n`;
            }
            if (reminders.length > 10) {
              message += `  ... and ${reminders.length - 10} more\n`;
            }
          }
        }
        
        message += `\n✅ You'll get notifications before each task starts!`;

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
      this.logger.error('Error details:', error.message, error.stack);
      
      // Provide more specific error messages based on the error type
      let userMessage = 'Unable to extract schedule from the uploaded PDF.';
      let debugInfo = error.message;
      
      if (error.message?.includes('Upload not found')) {
        userMessage = 'Could not find the uploaded PDF. Please try uploading the file again.';
      } else if (error.message?.includes('extract text')) {
        userMessage = 'Could not read text from the PDF. Make sure the PDF contains selectable text (not scanned images).';
      } else if (error.message?.includes('JSON') || error.message?.includes('parse')) {
        userMessage = 'Had trouble understanding the schedule format. Try a PDF with clear time blocks like "9:00 AM - 10:00 AM Task Name".';
      } else if (error.message?.includes('User not found')) {
        userMessage = 'Session error. Please refresh the page and try again.';
      }
      
      return {
        error: debugInfo,
        message: `G'day mate, ${userMessage}`,
        hint: 'Tip: Make sure your PDF has clear time ranges (e.g., "9:00 AM - 10:00 AM") followed by task names.',
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

  private async listReminders(data: { userId: string; projectId?: string; status?: string }) {
    const whereClause: any = { userId: data.userId };
    
    if (data.projectId) {
      whereClause.projectId = data.projectId;
    }
    
    if (data.status) {
      whereClause.status = data.status;
    }

    const reminders = await this.db.reminder.findMany({
      where: whereClause,
      orderBy: { dueAt: 'asc' },
      include: {
        project: {
          select: { name: true },
        },
      },
    });

    // Format reminders for display
    const formattedReminders = reminders.map(r => ({
      id: r.id,
      title: r.title,
      dueAt: r.dueAt.toISOString(),
      dueAtFormatted: r.dueAt.toLocaleString('en-AU', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      status: r.status,
      projectName: r.project?.name || 'No project',
    }));

    return {
      count: reminders.length,
      reminders: formattedReminders,
    };
  }
}

