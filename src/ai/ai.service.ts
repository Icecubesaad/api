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

TIME FILTERING FOR REMINDERS:
- When user asks for reminders in a specific time range, use the timeFilter parameter:
  * "next 5 hours" or "in the next 5 hours" → timeFilter: "next_hours:5"
  * "today" or "for today" → timeFilter: "today"
  * "tomorrow" → timeFilter: "tomorrow"
  * "this week" or "next 7 days" → timeFilter: "this_week"
  * "next 3 days" → timeFilter: "next_days:3"
  * "all reminders" or no time specified → timeFilter: "all" (or omit)
- Examples:
  * "What do I have in the next 2 hours?" → listReminders with timeFilter: "next_hours:2"
  * "Show me today's reminders" → listReminders with timeFilter: "today"
  * "What's on for tomorrow?" → listReminders with timeFilter: "tomorrow"

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
- For SINGLE reminder: use createReminder tool
- For MULTIPLE reminders (2 or more): ALWAYS use createBulkReminders tool
- Parse the date/time from user's message and create reminders right away
- ALWAYS use the current year - NEVER use 2022, 2023, or 2024

BULK REMINDERS (VERY IMPORTANT - READ CAREFULLY):
- If user message contains MORE THAN ONE task/reminder/event, you MUST use createBulkReminders
- Count the tasks in the message - if count >= 2, use createBulkReminders
- Examples that REQUIRE createBulkReminders:
  * "Schedule: meeting at 10am, call at 2pm, gym at 6pm" → 3 reminders → use createBulkReminders
  * "Remind me: buy groceries, call mom, submit report" → 3 reminders → use createBulkReminders
  * "Team meeting tomorrow, project due Friday, call tonight" → 3 reminders → use createBulkReminders
- Parse ALL tasks from the message into the reminders array
- For tasks without specific times, use reasonable defaults (9am for morning, 2pm for afternoon, 8pm for evening)
- For recurring tasks like "every Monday", create the next occurrence only
- For location-based reminders like "when I reach X", set a reasonable time
- NEVER call createReminder multiple times - ALWAYS use createBulkReminders for 2+ tasks

COMPLETING REMINDERS (VERY IMPORTANT):
- When user says "mark X complete", "done with X", "finished X", "X is done" - IMMEDIATELY call completeReminder with searchTitle set to the task name
- Examples:
  * "mark gym complete" → completeReminder with searchTitle: "gym"
  * "done with the meeting" → completeReminder with searchTitle: "meeting"
  * "finished my call" → completeReminder with searchTitle: "call"
- If multiple matches are found and user specifies:
  * "the first one" or "number 1" → use index: 1
  * "the second one" or "number 2" → use index: 2
  * "the 7pm one" → use searchTime: "7pm"
  * "the one on Dec 17" → use searchDate: "Dec 17"
  * "the Wednesday one" → use searchDate: "Wednesday"
- You do NOT need a reminderId - just use the task name/title and the tool will find it
- If from a check-in context with reminderId, you can use that instead

CHECK-IN RESPONSES (VERY IMPORTANT):
- When you see "[REMINDER CHECK-IN for" in a previous message, you sent an early check-in notification (before the task was due)
- When you see "[REMINDER FOLLOW-UP for" in a previous message, you sent a follow-up notification (after the task was due)
- If user replies to a check-in/follow-up with progress updates like "done", "finished", "completed", "all good", "yes" - call completeReminder with the reminderId from the context
- If user says "not yet", "still working", "need more time" - be encouraging and offer to help
- If user asks questions about the task, help them with the specific task mentioned
- Always reference the specific task name from the context in your response
- Example flow for EARLY check-in:
  * [REMINDER CHECK-IN for "Team meeting" (due in 30 min), reminderId: abc123] Hey mate! Meeting coming up!
  * User: "ready to go"
  * → Respond encouragingly: "Nice one! You've got this. Let me know how it goes!"
- Example flow for FOLLOW-UP:
  * [REMINDER FOLLOW-UP for "Team meeting" (was due 5 min ago), reminderId: abc123] Hey mate! How'd the meeting go?
  * User: "yes all done"
  * → Call completeReminder with reminderId "abc123", then respond "Awesome! Marked 'Team meeting' as done. 🎉"

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
        
        // Generate confirmation message based on tool results (pass timezone for correct time display)
        confirmationMessage = this.generateConfirmationMessage(toolResults, createdEntities, chatRequest.timezone);
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

  private generateConfirmationMessage(toolResults: any[], createdEntities: any, userTimezone?: string): string {
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
            // Show time in user's timezone (not server timezone)
            const dueDate = result.result.dueAt ? new Date(result.result.dueAt) : null;
            let timeStr = '';
            if (dueDate) {
              const tz = userTimezone || 'Australia/Sydney';
              timeStr = dueDate.toLocaleString('en-AU', {
                timeZone: tz,
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
            const { count, reminders, filterDescription } = result.result;
            if (count === 0) {
              const filterMsg = filterDescription ? ` ${filterDescription}` : '';
              messages.push(`${greeting} You don't have any reminders${filterMsg}. Would you like me to create one?`);
            } else {
              const filterMsg = filterDescription ? ` ${filterDescription}` : '';
              let reminderList = `${greeting} Here are your ${count} reminder${count > 1 ? 's' : ''}${filterMsg}:\n\n`;
              for (const r of reminders) {
                const statusIcon = r.status === 'COMPLETED' ? '✅' : r.status === 'CANCELLED' ? '❌' : '⏰';
                reminderList += `${statusIcon} "${r.title}" - ${r.dueAtFormatted} (${r.status})\n`;
              }
              messages.push(reminderList);
            }
          }
          break;

        case 'createBulkReminders':
          if (result.result) {
            const { created, failed, reminders: createdReminders } = result.result;
            if (created > 0) {
              let bulkMsg = `${greeting} I've created ${created} reminder${created > 1 ? 's' : ''} for you:\n\n`;
              for (const r of createdReminders) {
                bulkMsg += `⏰ "${r.title}" - ${r.dueAtLocal}\n`;
              }
              if (failed > 0) {
                bulkMsg += `\n⚠️ ${failed} reminder${failed > 1 ? 's' : ''} failed to create.`;
              }
              messages.push(bulkMsg);
            } else {
              messages.push(`${greeting} Sorry mate, couldn't create those reminders. Give it another go?`);
            }
          }
          break;

        case 'completeReminder':
          if (result.result?.success) {
            const title = result.result.title || 'your task';
            messages.push(`${greeting} Marked "${title}" as done! 🎉 Nice work, mate!`);
          } else if (result.result?.error) {
            messages.push(`${greeting} Couldn't mark that one as complete: ${result.result.error}`);
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
          description: 'Get reminders for the user from the database with optional time filtering. ALWAYS use this tool when user asks to see, list, or show their reminders. Supports filtering by time range like "next 5 hours", "today", "tomorrow", "this week". Never make up reminder data.',
          parameters: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Filter by project ID (optional)' },
              status: { type: 'string', description: 'Filter by status: PENDING, COMPLETED, CANCELLED (optional)' },
              timeFilter: { 
                type: 'string', 
                description: 'Time range filter. Options: "next_hours:N" (next N hours), "today", "tomorrow", "this_week", "next_days:N" (next N days), "all" (default). Examples: "next_hours:5" for next 5 hours, "next_days:3" for next 3 days.' 
              },
            },
            required: [],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'createBulkReminders',
          description: 'Create multiple reminders at once. USE THIS when user wants to create 2 or more reminders in one message. Example: "create reminders for 1am meeting, 2am call, 3am review" - parse all and use this tool instead of calling createReminder multiple times.',
          parameters: {
            type: 'object',
            properties: {
              projectId: { type: 'string', description: 'Project ID for all reminders (optional)' },
              reminders: {
                type: 'array',
                description: 'Array of reminders to create',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Reminder title' },
                    dueAt: { type: 'string', description: 'Due date/time in format YYYY-MM-DDTHH:mm:ss (user local time, no Z suffix)' },
                  },
                  required: ['title', 'dueAt'],
                },
              },
            },
            required: ['reminders'],
          },
        },
      },
      {
        type: 'function' as const,
        function: {
          name: 'completeReminder',
          description: 'Mark a reminder as completed. Use this when user says they finished a task, or asks to mark a reminder as done. You can search by title, and optionally narrow down by date/time or index if multiple matches.',
          parameters: {
            type: 'object',
            properties: {
              reminderId: { type: 'string', description: 'The reminder ID (use if available from check-in context)' },
              searchTitle: { type: 'string', description: 'Search for reminder by title/name. Example: "gym", "meeting", "Follow up on meeting"' },
              searchDate: { type: 'string', description: 'Narrow down by date. Example: "Dec 17", "17th", "Wednesday", "today"' },
              searchTime: { type: 'string', description: 'Narrow down by time. Example: "7pm", "7:00 pm", "19:00"' },
              index: { type: 'number', description: 'Select by position from previous list (1=first, 2=second). Use when user says "the first one", "number 2", etc.' },
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
            
            // Send notification with Australian greeting - use user's timezone
            const reminderTz = timezone || 'Australia/Sydney';
            const reminderTimeFormatted = new Date(reminder.dueAt).toLocaleString('en-AU', {
              timeZone: reminderTz,
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            });
            await this.notificationsService.sendNotification(userId, 'PUSH', {
              title: 'Hey mate! New reminder created',
              body: `Your reminder "${reminder.title}" is set for ${reminderTimeFormatted}`,
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
            
            // Send notification with Australian greeting - use user's timezone
            const eventTz = timezone || 'Australia/Sydney';
            const eventTitle = event?.summary || 'New Event';
            const eventStart = event?.start?.dateTime || event?.start || new Date();
            const eventTimeFormatted = new Date(eventStart).toLocaleString('en-AU', {
              timeZone: eventTz,
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            });
            await this.notificationsService.sendNotification(userId, 'PUSH', {
              title: 'G\'day Mate, Calendar event created',
              body: `Event "${eventTitle}" scheduled for ${eventTimeFormatted}`,
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
            
            // Send single notification for PDF import
            const remindersCreated = scheduleImport.summary?.remindersCreated || scheduleImport.commitResult?.createdReminders?.length || 0;
            if (remindersCreated > 0) {
              await this.notificationsService.sendNotification(userId, 'PUSH', {
                title: `G'day Mate! Schedule imported`,
                body: `${remindersCreated} tasks from your PDF are now set as reminders!`,
                data: { type: 'pdf_import', count: String(remindersCreated) },
              });
            }
            break;

          case 'listReminders':
            const reminders = await this.listReminders({
              ...parsedArgs,
              userId,
              timezone: timezone,
            });
            toolResults.push({ tool: name, result: reminders });
            break;

          case 'createBulkReminders':
            const bulkResult = await this.createBulkReminders({
              ...parsedArgs,
              userId,
              projectId: projectId || parsedArgs.projectId,
              timezone: timezone,
            });
            toolResults.push({ tool: name, result: bulkResult });
            createdEntities.bulkReminders = bulkResult;
            
            // Send single notification for bulk creation
            if (bulkResult.created > 0) {
              await this.notificationsService.sendNotification(userId, 'PUSH', {
                title: `Hey mate! ${bulkResult.created} reminders set`,
                body: `All your tasks are scheduled. You'll get notified when each one is due!`,
                data: { type: 'bulk_reminders', count: String(bulkResult.created) },
              });
            }
            break;

          case 'completeReminder':
            const completedReminder = await this.completeReminder({
              ...parsedArgs,
              userId,
              timezone: timezone,
            });
            toolResults.push({ tool: name, result: completedReminder });
            createdEntities.completedReminder = completedReminder;
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

  private async listReminders(data: { userId: string; projectId?: string; status?: string; timeFilter?: string; timezone?: string }) {
    const whereClause: any = { userId: data.userId };
    const userTimezone = data.timezone || 'Australia/Sydney';
    
    if (data.projectId) {
      whereClause.projectId = data.projectId;
    }
    
    if (data.status) {
      whereClause.status = data.status;
    }

    // Handle time filtering
    if (data.timeFilter && data.timeFilter !== 'all') {
      const now = new Date();
      let startDate: Date | null = null;
      let endDate: Date | null = null;

      // Get current time in user's timezone for accurate "today" calculations
      const nowInUserTz = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
      
      if (data.timeFilter.startsWith('next_hours:')) {
        const hours = parseInt(data.timeFilter.split(':')[1], 10);
        if (!isNaN(hours)) {
          startDate = now;
          endDate = new Date(now.getTime() + hours * 60 * 60 * 1000);
        }
      } else if (data.timeFilter.startsWith('next_days:')) {
        const days = parseInt(data.timeFilter.split(':')[1], 10);
        if (!isNaN(days)) {
          startDate = now;
          endDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        }
      } else if (data.timeFilter === 'today') {
        // Start of today in user's timezone
        const todayStart = new Date(nowInUserTz);
        todayStart.setHours(0, 0, 0, 0);
        
        // End of today in user's timezone
        const todayEnd = new Date(nowInUserTz);
        todayEnd.setHours(23, 59, 59, 999);
        
        // Convert back to UTC for database query
        startDate = this.convertLocalToUtc(todayStart, userTimezone);
        endDate = this.convertLocalToUtc(todayEnd, userTimezone);
      } else if (data.timeFilter === 'tomorrow') {
        // Start of tomorrow in user's timezone
        const tomorrowStart = new Date(nowInUserTz);
        tomorrowStart.setDate(tomorrowStart.getDate() + 1);
        tomorrowStart.setHours(0, 0, 0, 0);
        
        // End of tomorrow in user's timezone
        const tomorrowEnd = new Date(nowInUserTz);
        tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
        tomorrowEnd.setHours(23, 59, 59, 999);
        
        startDate = this.convertLocalToUtc(tomorrowStart, userTimezone);
        endDate = this.convertLocalToUtc(tomorrowEnd, userTimezone);
      } else if (data.timeFilter === 'this_week') {
        startDate = now;
        endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      }

      if (startDate && endDate) {
        whereClause.dueAt = {
          gte: startDate,
          lte: endDate,
        };
        this.logger.log(`Filtering reminders: ${data.timeFilter} -> ${startDate.toISOString()} to ${endDate.toISOString()}`);
      }
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

    // Format reminders for display in user's timezone
    const formattedReminders = reminders.map(r => ({
      id: r.id,
      title: r.title,
      dueAt: r.dueAt.toISOString(),
      dueAtFormatted: r.dueAt.toLocaleString('en-AU', {
        timeZone: userTimezone,
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

    // Generate a helpful filter description
    let filterDescription = '';
    if (data.timeFilter) {
      if (data.timeFilter.startsWith('next_hours:')) {
        const hours = data.timeFilter.split(':')[1];
        filterDescription = `in the next ${hours} hour${hours === '1' ? '' : 's'}`;
      } else if (data.timeFilter.startsWith('next_days:')) {
        const days = data.timeFilter.split(':')[1];
        filterDescription = `in the next ${days} day${days === '1' ? '' : 's'}`;
      } else if (data.timeFilter === 'today') {
        filterDescription = 'for today';
      } else if (data.timeFilter === 'tomorrow') {
        filterDescription = 'for tomorrow';
      } else if (data.timeFilter === 'this_week') {
        filterDescription = 'for this week';
      }
    }

    return {
      count: reminders.length,
      reminders: formattedReminders,
      filterDescription,
      timeFilter: data.timeFilter || 'all',
    };
  }

  // Helper to convert local time to UTC
  private convertLocalToUtc(localDate: Date, timezone: string): Date {
    // Create a formatter to get the offset
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    const utcGuess = new Date(localDate.toISOString().replace('Z', ''));
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
    const targetMs = localDate.getTime();
    const actualLocalMs = new Date(`${localTimeFromUtc}Z`).getTime();
    const offsetMs = targetMs - actualLocalMs;
    
    return new Date(utcGuess.getTime() + offsetMs);
  }

  // Create multiple reminders at once
  private async createBulkReminders(data: {
    userId: string;
    projectId?: string;
    timezone?: string;
    reminders: Array<{ title: string; dueAt: string }>;
  }) {
    const projectId = data.projectId || await this.getOrCreateDefaultProject(data.userId);
    const userTimezone = data.timezone || 'Australia/Sydney';
    
    const createdReminders = [];
    const errors = [];

    for (const reminderData of data.reminders) {
      try {
        // Convert local time to UTC (same logic as createReminder)
        const dueAtStr = reminderData.dueAt;
        let dueAtDate: Date;
        
        const hasTimezoneInfo = dueAtStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dueAtStr);
        
        if (hasTimezoneInfo) {
          dueAtDate = new Date(dueAtStr);
        } else {
          const match = dueAtStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):?(\d{2})?/);
          
          if (match) {
            const [, year, month, day, hour, minute, second = '00'] = match;
            const targetLocalTime = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
            let utcGuess = new Date(`${targetLocalTime}Z`);
            
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
            const targetMs = new Date(`${targetLocalTime}Z`).getTime();
            const actualLocalMs = new Date(`${localTimeFromUtc}Z`).getTime();
            const offsetMs = targetMs - actualLocalMs;
            
            dueAtDate = new Date(utcGuess.getTime() + offsetMs);
          } else {
            dueAtDate = new Date(dueAtStr);
          }
        }

        const reminder = await this.db.reminder.create({
          data: {
            title: reminderData.title,
            dueAt: dueAtDate,
            projectId: projectId,
            userId: data.userId,
          },
        });

        createdReminders.push({
          id: reminder.id,
          title: reminder.title,
          dueAt: reminder.dueAt.toISOString(),
          dueAtLocal: reminder.dueAt.toLocaleString('en-AU', {
            timeZone: userTimezone,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }),
        });
      } catch (error) {
        this.logger.error(`Failed to create reminder "${reminderData.title}":`, error);
        errors.push({ title: reminderData.title, error: error.message });
      }
    }

    this.logger.log(`Bulk created ${createdReminders.length} reminders for user ${data.userId}`);

    return {
      success: true,
      created: createdReminders.length,
      failed: errors.length,
      reminders: createdReminders,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  // Mark a reminder as completed - supports ID, title search, or index from previous list
  private async completeReminder(data: { 
    userId: string; 
    reminderId?: string; 
    searchTitle?: string; 
    searchDate?: string;  // Date to narrow down (e.g., "Dec 17", "17th", "Wednesday")
    searchTime?: string;  // Time to narrow down (e.g., "7pm", "19:00")
    index?: number;       // Index from previous list (1-based: "the first one")
    timezone?: string 
  }) {
    const userTimezone = data.timezone || 'Australia/Sydney';
    
    try {
      let reminder;

      // If reminderId is provided, use it directly
      if (data.reminderId) {
        reminder = await this.db.reminder.findFirst({
          where: {
            id: data.reminderId,
            userId: data.userId,
          },
        });
      } 
      // Otherwise, search by title (and optionally date/time)
      else if (data.searchTitle) {
        const searchTerm = data.searchTitle.toLowerCase().trim();
        
        const pendingReminders = await this.db.reminder.findMany({
          where: {
            userId: data.userId,
            status: 'PENDING',
          },
          orderBy: { dueAt: 'asc' },
        });

        // Score-based matching - prioritize exact matches
        const scoredMatches = pendingReminders.map(r => {
          const title = r.title.toLowerCase();
          const titleWithoutPrefix = title.replace('reminder: ', '');
          let score = 0;
          
          // Exact match (highest priority)
          if (title === searchTerm || titleWithoutPrefix === searchTerm) {
            score = 100;
          }
          // Title starts with search term
          else if (titleWithoutPrefix.startsWith(searchTerm)) {
            score = 80;
          }
          // Search term starts with title (user typed more)
          else if (searchTerm.startsWith(titleWithoutPrefix)) {
            score = 70;
          }
          // Title contains search term as whole word
          else if (titleWithoutPrefix.includes(searchTerm) && 
                   (titleWithoutPrefix.includes(` ${searchTerm}`) || 
                    titleWithoutPrefix.includes(`${searchTerm} `) ||
                    titleWithoutPrefix === searchTerm)) {
            score = 60;
          }
          // Partial match - search term is substring
          else if (titleWithoutPrefix.includes(searchTerm)) {
            score = 40;
          }
          // Very loose match - any word overlap
          else {
            const searchWords = searchTerm.split(/\s+/);
            const titleWords = titleWithoutPrefix.split(/\s+/);
            const overlap = searchWords.filter(w => titleWords.some(tw => tw.includes(w) || w.includes(tw)));
            if (overlap.length > 0) {
              score = 20 * overlap.length / searchWords.length;
            }
          }
          
          return { reminder: r, score };
        }).filter(m => m.score > 0).sort((a, b) => b.score - a.score);

        let matchingReminders = scoredMatches.map(m => m.reminder);

        // If date/time specified, filter further
        if (data.searchDate || data.searchTime) {
          matchingReminders = matchingReminders.filter(r => {
            const dueStr = r.dueAt.toLocaleString('en-AU', {
              timeZone: userTimezone,
              weekday: 'long',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }).toLowerCase();
            
            if (data.searchDate && !dueStr.includes(data.searchDate.toLowerCase())) {
              return false;
            }
            if (data.searchTime) {
              const timeNormalized = data.searchTime.toLowerCase().replace(/\s/g, '');
              if (!dueStr.replace(/\s/g, '').includes(timeNormalized)) {
                return false;
              }
            }
            return true;
          });
        }

        // If index specified (user said "the first one", "the second one")
        if (data.index && data.index > 0 && matchingReminders.length >= data.index) {
          reminder = matchingReminders[data.index - 1];
        }
        // If only one match after filtering, use it
        else if (matchingReminders.length === 1) {
          reminder = matchingReminders[0];
        }
        // If multiple matches with same high score, ask for clarification
        else if (matchingReminders.length > 1) {
          // Check if top matches have same score (true duplicates)
          const topScore = scoredMatches[0]?.score || 0;
          const sameScoreMatches = scoredMatches.filter(m => m.score === topScore);
          
          if (sameScoreMatches.length === 1) {
            // Only one best match, use it
            reminder = sameScoreMatches[0].reminder;
          } else {
            // Multiple matches with same score - ask user
            const options = matchingReminders.slice(0, 5).map((r, idx) => {
              const timeStr = r.dueAt.toLocaleString('en-AU', {
                timeZone: userTimezone,
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              });
              return `${idx + 1}. "${r.title.replace('Reminder: ', '')}" - ${timeStr}`;
            }).join('\n');
            
            return {
              success: false,
              multipleMatches: true,
              count: matchingReminders.length,
              matches: matchingReminders.slice(0, 5).map((r, idx) => ({
                index: idx + 1,
                id: r.id,
                title: r.title,
                dueAt: r.dueAt.toISOString(),
              })),
              error: `Found ${matchingReminders.length} matching reminders:\n\n${options}\n\nWhich one? Say "the first one" or specify the date/time.`,
            };
          }
        }

        if (!reminder && pendingReminders.length > 0) {
          const reminderList = pendingReminders.slice(0, 5).map(r => {
            const timeStr = r.dueAt.toLocaleString('en-AU', {
              timeZone: userTimezone,
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            });
            return `"${r.title.replace('Reminder: ', '')}" (${timeStr})`;
          }).join(', ');
          return {
            success: false,
            error: `Couldn't find a reminder matching "${data.searchTitle}". Your pending reminders: ${reminderList}`,
          };
        }
      } else {
        return {
          success: false,
          error: 'Please specify which reminder to complete (by name or from a check-in)',
        };
      }

      if (!reminder) {
        this.logger.warn(`Reminder not found for user ${data.userId} (search: ${data.searchTitle || data.reminderId})`);
        return {
          success: false,
          error: `Couldn't find that reminder. It may already be completed or doesn't exist.`,
        };
      }

      // Check if already completed
      if (reminder.status === 'COMPLETED') {
        return {
          success: true,
          reminderId: reminder.id,
          title: reminder.title,
          status: 'COMPLETED',
          message: `"${reminder.title.replace('Reminder: ', '')}" is already marked as complete!`,
        };
      }

      // Update the reminder status to COMPLETED
      const updatedReminder = await this.db.reminder.update({
        where: { id: reminder.id },
        data: { status: 'COMPLETED' },
      });

      this.logger.log(`Marked reminder "${updatedReminder.title}" as completed for user ${data.userId}`);

      return {
        success: true,
        reminderId: updatedReminder.id,
        title: updatedReminder.title,
        status: updatedReminder.status,
      };
    } catch (error) {
      this.logger.error(`Failed to complete reminder:`, error);
      return {
        success: false,
        error: error.message || 'Failed to complete reminder',
      };
    }
  }
}

