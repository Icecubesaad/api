# JobMate User Workflow - First-Time User Experience

## Prompt
now show a workflow where a user uses this application for the first time and start using it and execute all the tools. A routine task maybe that is bothering him. and do show the file name and structure when the tool is being executed.

## Response

# JobMate First-Time User Workflow: Sarah's Daily Schedule Management

## User Scenario
**Sarah** is a project manager who struggles with managing her daily schedule from PDF meeting agendas. She constantly misses meetings and forgets to prepare for important calls. She discovers JobMate and decides to try it.

---

## Step 1: User Registration & Authentication
**User Action**: Sarah visits the app and signs up with Google

### Files Executed:
```
src/auth/auth.controller.ts → @Post('register')
├── src/auth/auth.service.ts → register()
├── src/auth/firebase-auth.guard.ts → validateUser()
├── src/users/users.service.ts → create()
└── src/database/database.service.ts → user.create()
```

### Database Operations:
```sql
-- In PostgreSQL via Prisma
INSERT INTO users (id, email, displayName, firebaseUid, authProvider, tier)
VALUES ('cuid123', 'sarah@company.com', 'Sarah Johnson', 'firebase_uid_456', 'FIREBASE', 'BASIC');
```

### Response:
```json
{
  "user": {
    "id": "cuid123",
    "email": "sarah@company.com",
    "displayName": "Sarah Johnson",
    "tier": "BASIC"
  },
  "token": "jwt_token_here"
}
```

---

## Step 2: Default Project Creation
**User Action**: Sarah's first interaction triggers auto-project creation

### Files Executed:
```
src/ai/ai.service.ts → getOrCreateDefaultProject()
├── src/database/database.service.ts → project.findFirst()
└── src/database/database.service.ts → project.create()
```

### Database Operations:
```sql
INSERT INTO projects (id, ownerId, name, description)
VALUES ('proj_abc123', 'cuid123', 'My Project', 'Default project created by AI assistant');
```

---

## Step 3: Upload Daily Schedule PDF
**User Action**: Sarah uploads her "Daily_Meeting_Schedule_Dec15.pdf"

### Files Executed:
```
src/uploads/uploads.controller.ts → @Post()
├── src/uploads/uploads.service.ts → uploadFile()
├── src/tasks/tasks.service.ts → processPdf()
├── src/ai/pdf-ingest.service.ts → processPdf()
└── src/ai/rag.service.ts → ingestUpload()
```

### Background Processing Queue:
```
src/tasks/processors/pdf-processing.processor.ts
├── Extract PDF text content
├── Generate embeddings via OpenAI
└── Store in pgvector database
```

### Database Operations:
```sql
-- Upload record
INSERT INTO uploads (id, projectId, userId, storageKey, mime, bytes, parseStatus)
VALUES ('upload_xyz789', 'proj_abc123', 'cuid123', 's3_key_456', 'application/pdf', 2048576, 'PROCESSING');

-- Vector embeddings (multiple chunks)
INSERT INTO embeddings (id, projectId, sourceType, sourceId, vector, chunkText, chunkIndex)
VALUES ('emb_001', 'proj_abc123', 'UPLOAD', 'upload_xyz789', '[0.1, 0.2, ...]', 'Meeting with client at 9:00 AM...', 0);
```

### PDF Content Example:
```
Daily Schedule - December 15, 2025
9:00 AM - 10:00 AM: Client Review Meeting (Conference Room A)
10:30 AM - 11:30 AM: Team Standup (Zoom)
1:00 PM - 2:00 PM: Budget Planning Session
3:00 PM - 4:00 PM: Project Kickoff Call
```

---

## Step 4: AI Chat - Schedule Import Request
**User Action**: Sarah types: "Hey, I just uploaded my daily schedule. Can you help me set up reminders for all my meetings today?"

### Files Executed:
```
src/ai/ai.controller.ts → @Post('chat')
├── src/ai/ai.service.ts → chat()
├── src/ai/rag.service.ts → retrieve() // Gets PDF content
├── OpenAI API → GPT-4 completion
└── src/ai/ai.service.ts → executeToolCalls()
    └── importScheduleFromPdf()
```

### RAG Context Retrieval:
```
src/ai/rag.service.ts → retrieve()
├── Generate query embedding
├── PostgreSQL vector search: SELECT * FROM embeddings WHERE vector <=> query_vector
└── Return relevant PDF chunks
```

### AI Response Processing:
```
src/ai/ai.service.ts → importScheduleFromPdf()
├── src/schedule/schedule.service.ts → importScheduleFromPdf()
├── src/schedule/pdf-schedule-parse.service.ts → parseScheduleFromUpload()
└── OpenAI API → Extract structured schedule data
```

### AI Tool Execution Result:
```json
{
  "message": "G'day mate! I've found your schedule and parsed 4 meetings. Let me create reminders for each one.",
  "toolResults": [{
    "tool": "importScheduleFromPdf",
    "result": {
      "blocks": [
        {
          "title": "Client Review Meeting",
          "startsAt": "2025-12-15T09:00:00Z",
          "endsAt": "2025-12-15T10:00:00Z",
          "description": "Conference Room A"
        }
        // ... 3 more meetings
      ]
    }
  }]
}
```

---

## Step 5: Automatic Reminder Creation
**System Action**: AI automatically creates reminders for each meeting

### Files Executed:
```
src/schedule/schedule.service.ts → commitSchedule()
├── src/reminders/reminders.service.ts → create() (x4 meetings)
├── src/tasks/tasks.service.ts → scheduleReminderNotification() (x4)
└── src/notifications/notifications.service.ts → sendNotification()
```

### Database Operations:
```sql
-- Create 4 reminders
INSERT INTO reminders (id, projectId, userId, title, dueAt, status)
VALUES 
  ('rem_001', 'proj_abc123', 'cuid123', 'Reminder: Client Review Meeting', '2025-12-15T08:45:00Z', 'PENDING'),
  ('rem_002', 'proj_abc123', 'cuid123', 'Reminder: Team Standup', '2025-12-15T10:15:00Z', 'PENDING'),
  ('rem_003', 'proj_abc123', 'cuid123', 'Reminder: Budget Planning Session', '2025-12-15T12:45:00Z', 'PENDING'),
  ('rem_004', 'proj_abc123', 'cuid123', 'Reminder: Project Kickoff Call', '2025-12-15T14:45:00Z', 'PENDING');

-- Schedule notifications
INSERT INTO notifications (id, userId, title, body, metaJson)
VALUES ('notif_001', 'cuid123', 'Hey mate! New reminder created', 'Your reminder "Client Review Meeting" is set for 8:45 AM', '{"type": "reminder", "id": "rem_001"}');
```

### Background Job Scheduling:
```
Redis Queue: reminder-notifications
├── Job 1: Send reminder at 8:45 AM for Client Meeting
├── Job 2: Send reminder at 10:15 AM for Team Standup
├── Job 3: Send reminder at 12:45 PM for Budget Planning
└── Job 4: Send reminder at 2:45 PM for Project Kickoff
```

---

## Step 6: Calendar Integration Setup
**User Action**: Sarah wants calendar sync, clicks "Connect Google Calendar"

### Files Executed:
```
src/calendar/calendar.controller.ts → @Get('auth-url')
├── src/calendar/calendar.service.ts → getAuthUrl()
└── Google OAuth API → Generate authorization URL
```

### OAuth Flow:
```
src/calendar/calendar.controller.ts → @Post('connect')
├── src/calendar/calendar.service.ts → connectProvider()
├── Google Calendar API → Exchange auth code for tokens
└── src/database/database.service.ts → calendarLink.create()
```

### Database Operations:
```sql
INSERT INTO calendar_links (id, userId, provider, refreshTokenEnc, calendarId)
VALUES ('cal_link_001', 'cuid123', 'GOOGLE', 'encrypted_refresh_token', 'primary');
```

---

## Step 7: Calendar Event Creation
**System Action**: Create calendar events for all meetings

### Files Executed:
```
src/schedule/schedule.service.ts → createEvent() (x4 meetings)
├── src/calendar/calendar.service.ts → createEvent()
├── Google Calendar API → Create events
└── src/database/database.service.ts → event.create()
```

### Database Operations:
```sql
INSERT INTO events (id, projectId, provider, providerEventId, title, startsAt, endsAt, metaJson)
VALUES 
  ('evt_001', 'proj_abc123', 'GOOGLE', 'google_event_123', 'Client Review Meeting', '2025-12-15T09:00:00Z', '2025-12-15T10:00:00Z', '{"location": "Conference Room A"}'),
  -- ... 3 more events
```

---

## Step 8: Voice Note During Meeting
**User Action**: During the client meeting, Sarah records a voice note

### Files Executed:
```
src/notes/notes.controller.ts → @Post('voice')
├── src/notes/notes.service.ts → createVoiceNote()
├── OpenAI Whisper API → Transcribe audio
├── src/ai/rag.service.ts → ingestNote()
└── src/database/database.service.ts → note.create()
```

### Database Operations:
```sql
INSERT INTO notes (id, projectId, userId, content, kind, audioPath, tags)
VALUES ('note_001', 'proj_abc123', 'cuid123', 'Client approved the new design mockups. Requested changes to color scheme. Next meeting scheduled for Dec 20th.', 'VOICE', 's3://audio/voice_note_001.wav', '["client", "design", "approved"]');

-- Vector embedding for searchability
INSERT INTO embeddings (id, projectId, sourceType, sourceId, vector, chunkText)
VALUES ('emb_note_001', 'proj_abc123', 'NOTE', 'note_001', '[0.3, 0.1, ...]', 'Client approved the new design mockups...');
```

---

## Step 9: AI Chat - Daily Summary Request
**User Action**: End of day, Sarah asks: "Can you summarize my day and suggest next actions?"

### Files Executed:
```
src/ai/ai.controller.ts → @Post('chat')
├── src/ai/ai.service.ts → chat()
├── src/ai/rag.service.ts → retrieve() // Gets all day's context
├── src/ai/ai.service.ts → executeToolCalls()
└── summarizeNotes()
```

### RAG Context Assembly:
```
src/ai/rag.service.ts → retrieve()
├── Query: "summarize day next actions"
├── Vector search across: notes, uploads, daily logs
├── Context: PDF schedule + voice notes + meeting records
└── Return: Comprehensive day context
```

### AI Summary Generation:
```
src/ai/ai.service.ts → summarizeNotes()
├── Aggregate all notes from today
├── OpenAI GPT-4 → Generate summary
└── Extract next actions
```

### Response:
```json
{
  "message": "Here's your day summary, mate!",
  "toolResults": [{
    "tool": "summarizeNotes",
    "result": {
      "summary": "Great day! You completed 4 meetings: Client approved design mockups, team standup went well, budget planning identified cost savings, and project kickoff was successful. Key achievement: Client approval on designs.",
      "nextActions": [
        "Implement client's color scheme changes",
        "Schedule follow-up meeting for Dec 20th",
        "Share budget findings with stakeholders",
        "Send project kickoff summary to team"
      ]
    }
  }]
}
```

---

## Step 10: Create Follow-up Reminders
**User Action**: Sarah says: "Create a reminder to implement the color changes by tomorrow 2 PM"

### Files Executed:
```
src/ai/ai.service.ts → executeToolCalls()
└── createReminder()
    ├── src/ai/ai.service.ts → createReminder()
    ├── src/database/database.service.ts → reminder.create()
    └── src/notifications/notifications.service.ts → sendNotification()
```

### Database Operations:
```sql
INSERT INTO reminders (id, projectId, userId, title, dueAt, status)
VALUES ('rem_005', 'proj_abc123', 'cuid123', 'Implement client color scheme changes', '2025-12-16T14:00:00Z', 'PENDING');
```

---

## Step 11: Push Notification Delivery
**System Action**: Throughout the day, reminders are sent via FCM

### Files Executed:
```
src/tasks/processors/reminder-notifications.processor.ts
├── src/notifications/notifications.service.ts → sendPushNotification()
├── Firebase Cloud Messaging API → Send to device
└── src/database/database.service.ts → notification.create()
```

### Push Notification Examples:
```json
{
  "title": "G'day Mate, \"Client Review Meeting\" starts at 9:00 AM — time to roll.",
  "body": "Your scheduled meeting is starting in 15 minutes",
  "data": {
    "type": "reminder_due",
    "reminderId": "rem_001",
    "eventTitle": "Client Review Meeting"
  }
}
```

---

## Complete File Execution Map

### **Core Workflow Files Used:**
1. **Authentication**: `auth.controller.ts`, `auth.service.ts`, `firebase-auth.guard.ts`
2. **Project Management**: `projects.service.ts`, `database.service.ts`
3. **File Processing**: `uploads.controller.ts`, `pdf-ingest.service.ts`, `tasks.service.ts`
4. **AI Processing**: `ai.controller.ts`, `ai.service.ts`, `rag.service.ts`
5. **Schedule Management**: `schedule.service.ts`, `pdf-schedule-parse.service.ts`
6. **Reminder System**: `reminders.service.ts`, `tasks.service.ts`
7. **Calendar Integration**: `calendar.service.ts`, `calendar.controller.ts`
8. **Notifications**: `notifications.service.ts`, FCM processors
9. **Voice Notes**: `notes.controller.ts`, `notes.service.ts`
10. **Background Jobs**: `tasks/processors/*.ts`, Redis queues

### **Database Tables Touched:**
- `users`, `projects`, `uploads`, `notes`, `reminders`, `events`, `calendar_links`, `notifications`, `embeddings`, `audit_events`

### **External APIs Called:**
- Firebase Auth, OpenAI GPT-4, OpenAI Whisper, OpenAI Embeddings, Google Calendar API, Firebase Cloud Messaging, AWS S3

This workflow demonstrates how Sarah transforms from a disorganized schedule manager to having a fully automated, AI-powered daily assistant that proactively manages her time and keeps her on track.