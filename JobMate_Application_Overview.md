# JobMate Application Analysis - Overview

## Prompt
explain to me this whole application from a user prespective. a user will come in this app, and he will do some tasks, execute all the tools, thats related to their daily life workflow. when they are executing tools and running this application, I wanna know what functions in while files are running. How many total tools are and which one was executed, hows the modularity of the whole application and how it is all structured.

## Response

# JobMate: Universal Daily Assistant - Complete User Workflow Analysis

## Overview
JobMate is a comprehensive daily productivity assistant built with NestJS that helps users manage their work, projects, and daily tasks through AI-powered automation and intelligent organization.

## User Journey & Daily Workflow

### 1. **User Onboarding & Authentication**
- Users sign up via Firebase Authentication (Google OAuth supported)
- Profile creation with subscription tiers (Basic/Premium)
- Stripe integration for billing management

### 2. **Project Organization**
- Users create projects to organize their work
- Each project acts as a container for notes, files, reminders, and calendar events
- Default project auto-created if none exists

### 3. **Daily Workflow Tools**

#### **Content Creation & Management**
- **Note Taking**: Text, voice, and AI-generated notes
- **File Uploads**: PDF documents with intelligent parsing
- **Voice Notes**: Audio recording with transcription capabilities

#### **AI-Powered Assistant**
- **Chat Interface**: Natural language interaction with AI assistant
- **RAG (Retrieval Augmented Generation)**: AI searches through user's notes, uploads, and logs for contextual responses
- **Australian Personality**: Friendly assistant with Australian slang ("Hey mate!", "G'day Mate", "No worries")

#### **Schedule & Task Management**
- **PDF Schedule Import**: Upload schedule PDFs and automatically extract tasks/events
- **Smart Reminder Creation**: AI creates reminders with appropriate lead times (15min for long tasks, 5min for short ones)
- **Calendar Integration**: Google/Microsoft Calendar sync for event creation
- **Recurrent Reminders**: Daily, weekly, monthly patterns supported

#### **Calendar & Time Management**
- **External Calendar Sync**: Connect Google/Microsoft calendars
- **Event Creation**: Manual or AI-assisted event scheduling
- **Time Conflict Detection**: Smart scheduling to avoid overlaps

## Complete Tool Inventory (47+ Functions)

### **AI Tools (6 Core Functions)**
1. **generateNote** - Convert conversations/voice to structured notes
2. **createReminder** - Create time-based reminders with recurrence
3. **createCalendarEvent** - Add events to connected calendars
4. **summarizeNotes** - Generate summaries from project notes
5. **scheduleFromNotes** - Auto-create calendar events from note content
6. **importScheduleFromPdf** - Parse uploaded PDFs and create schedule items

### **Project Management (4 Functions)**
- Create projects
- List user projects
- Get project details
- Delete projects

### **Note Management (3 Functions)**
- Create text/voice notes
- List notes with filtering
- Voice note transcription

### **File Management (5 Functions)**
- Generate presigned upload URLs
- Finalize uploads and trigger processing
- Direct file upload
- Get upload details
- Test upload functionality

### **Reminder System (5 Functions)**
- Create reminders
- List reminders with filtering
- Delete reminders
- Get upcoming reminders (24h)
- Send immediate notifications

### **Calendar Integration (6 Functions)**
- Get OAuth URLs for providers
- Connect calendar providers
- Create calendar events
- List calendar events
- Check connection status
- Debug connection issues

### **Schedule Management (2 Functions)**
- Preview parsed schedules from uploads
- Commit schedules (create events/reminders)

### **Notification System (4 Functions)**
- Send test notifications
- Get recent notifications
- Demo schedule notifications
- Register FCM tokens for push notifications

### **User & Profile Management (4 Functions)**
- Create users
- Get user profiles
- Get current user info
- Get subscription status

### **Billing & Subscriptions (2 Functions)**
- Create Stripe checkout sessions
- Handle Stripe webhooks

### **Background Processing (4 Functions)**
- PDF processing queue
- Reminder notification scheduling
- Daily check-in scheduling
- Notification cancellation

### **Health & Monitoring (2 Functions)**
- Basic health checks
- Detailed health with database status

### **Webhook Integration (2 Functions)**
- Stripe payment webhooks
- FCM token registration

## Application Architecture & Modularity

### **Modular Design (14 Feature Modules)**
1. **Auth Module** - Firebase authentication, JWT tokens
2. **AI Module** - OpenAI integration, RAG, PDF parsing
3. **Projects Module** - Project CRUD operations
4. **Notes Module** - Note management, voice transcription
5. **Uploads Module** - File handling, S3 integration
6. **Calendar Module** - Google/Microsoft calendar sync
7. **Reminders Module** - Time-based notifications
8. **Schedule Module** - PDF schedule parsing and commitment
9. **Notifications Module** - Push notifications, FCM
10. **Users Module** - User management
11. **Profile Module** - User profiles, subscriptions
12. **Billing Module** - Stripe integration
13. **Tasks Module** - Background job processing
14. **Webhooks Module** - External service integrations

### **Technology Stack**
- **Backend**: NestJS with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Vector Search**: pgvector for AI embeddings
- **Queue System**: Redis + Bull for background jobs
- **AI**: OpenAI GPT-4 and text-embedding-ada-002
- **Authentication**: Firebase Auth
- **File Storage**: AWS S3
- **Payments**: Stripe
- **Push Notifications**: Firebase Cloud Messaging
- **Calendar APIs**: Google Calendar, Microsoft Graph

### **Data Flow Architecture**

#### **User Interaction Flow**
1. User uploads PDF → **Uploads Module** → **Tasks Module** (background processing)
2. PDF processed → **AI Module** (content extraction) → **RAG Service** (embeddings)
3. User chats with AI → **AI Module** → **RAG Service** (context retrieval) → OpenAI API
4. AI suggests actions → **Schedule/Reminders/Calendar Modules** → External APIs
5. Notifications sent → **Notifications Module** → FCM → User devices

#### **Background Processing**
- **PDF Processing Queue**: Extracts text, creates embeddings
- **Reminder Notifications**: Scheduled push notifications
- **Daily Check-ins**: Recurring user engagement

## User Experience Workflow

### **Typical Daily Session**
1. **Morning**: User uploads daily schedule PDF
2. **AI Processing**: System extracts tasks, creates reminders automatically
3. **Throughout Day**: User receives timely notifications before each task
4. **Note Taking**: User creates voice/text notes during meetings
5. **AI Assistance**: User chats with AI for summaries, next actions
6. **Evening**: AI generates daily log summary from notes and activities

### **Key User Benefits**
- **Intelligent Automation**: PDF schedules become actionable reminders
- **Contextual AI**: Assistant knows user's project history and context
- **Multi-Platform Sync**: Calendar integration across Google/Microsoft
- **Proactive Notifications**: Smart reminder timing based on task duration
- **Voice Integration**: Hands-free note taking and interaction
- **Subscription Flexibility**: Basic and Premium tiers with Stripe billing

### **Scalability & Performance**
- **Microservice Architecture**: Each module is independently scalable
- **Queue-Based Processing**: Heavy operations (PDF parsing, AI) run asynchronously
- **Vector Database**: Efficient similarity search for large document collections
- **Caching Strategy**: Redis for session management and job queues
- **API Rate Limiting**: Throttling to prevent abuse
- **Health Monitoring**: Comprehensive health checks for all services

The application demonstrates enterprise-level architecture with clean separation of concerns, making it highly maintainable and extensible for future features.