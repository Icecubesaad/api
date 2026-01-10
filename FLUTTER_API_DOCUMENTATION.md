# JobMate API Documentation for Flutter

## Base Configuration

```dart
// lib/core/api_config.dart
class ApiConfig {
  static const String baseUrl = 'http://localhost:3000'; // Change for production
  static String? _authToken;
  
  static void setAuthToken(String token) => _authToken = token;
  static String? get authToken => _authToken;
  
  static Map<String, String> get headers => {
    'Content-Type': 'application/json',
    if (_authToken != null) 'Authorization': 'Bearer $_authToken',
  };
}
```

```dart
// lib/core/api_client.dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiClient {
  static Future<Map<String, dynamic>> get(String endpoint) async {
    final response = await http.get(
      Uri.parse('${ApiConfig.baseUrl}$endpoint'),
      headers: ApiConfig.headers,
    );
    return _handleResponse(response);
  }
  
  static Future<Map<String, dynamic>> post(String endpoint, Map<String, dynamic> body) async {
    final response = await http.post(
      Uri.parse('${ApiConfig.baseUrl}$endpoint'),
      headers: ApiConfig.headers,
      body: jsonEncode(body),
    );
    return _handleResponse(response);
  }
  
  static Future<Map<String, dynamic>> patch(String endpoint, Map<String, dynamic> body) async {
    final response = await http.patch(
      Uri.parse('${ApiConfig.baseUrl}$endpoint'),
      headers: ApiConfig.headers,
      body: jsonEncode(body),
    );
    return _handleResponse(response);
  }
  
  static Future<Map<String, dynamic>> delete(String endpoint) async {
    final response = await http.delete(
      Uri.parse('${ApiConfig.baseUrl}$endpoint'),
      headers: ApiConfig.headers,
    );
    return _handleResponse(response);
  }
  
  static Map<String, dynamic> _handleResponse(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return jsonDecode(response.body);
    }
    throw ApiException(response.statusCode, jsonDecode(response.body)['message'] ?? 'Request failed');
  }
}

class ApiException implements Exception {
  final int statusCode;
  final String message;
  ApiException(this.statusCode, this.message);
}
```

---


## 1. Authentication

### 1.1 Sign Up (Email/Password)
Creates a new user account.

**Endpoint:** `POST /auth/signup`  
**Auth Required:** No

```dart
// lib/services/auth_service.dart
Future<AuthResponse> signUp(String email, String password, {String? displayName}) async {
  final response = await ApiClient.post('/auth/signup', {
    'email': email,
    'password': password,
    if (displayName != null) 'displayName': displayName,
  });
  
  final authResponse = AuthResponse.fromJson(response);
  ApiConfig.setAuthToken(authResponse.accessToken);
  return authResponse;
}

// Model
class AuthResponse {
  final String accessToken;
  final UserModel user;
  
  AuthResponse({required this.accessToken, required this.user});
  
  factory AuthResponse.fromJson(Map<String, dynamic> json) => AuthResponse(
    accessToken: json['accessToken'],
    user: UserModel.fromJson(json['user']),
  );
}

class UserModel {
  final String id;
  final String email;
  final String? displayName;
  final String firebaseUid;
  final String authProvider;
  final String tier;
  
  UserModel({
    required this.id,
    required this.email,
    this.displayName,
    required this.firebaseUid,
    required this.authProvider,
    required this.tier,
  });
  
  factory UserModel.fromJson(Map<String, dynamic> json) => UserModel(
    id: json['id'],
    email: json['email'],
    displayName: json['displayName'],
    firebaseUid: json['firebaseUid'],
    authProvider: json['authProvider'],
    tier: json['tier'],
  );
}
```

### 1.2 Login (Email/Password)
Login with existing credentials.

**Endpoint:** `POST /auth/login`  
**Auth Required:** No

```dart
Future<AuthResponse> login(String email, String password) async {
  final response = await ApiClient.post('/auth/login', {
    'email': email,
    'password': password,
  });
  
  final authResponse = AuthResponse.fromJson(response);
  ApiConfig.setAuthToken(authResponse.accessToken);
  return authResponse;
}
```

### 1.3 Google Sign-In (Firebase)
Login using Firebase Google authentication.

**Endpoint:** `POST /auth/google-signin`  
**Auth Required:** No

```dart
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

Future<AuthResponse> googleSignIn() async {
  // 1. Sign in with Google
  final GoogleSignInAccount? googleUser = await GoogleSignIn().signIn();
  if (googleUser == null) throw Exception('Google sign-in cancelled');
  
  // 2. Get auth details
  final GoogleSignInAuthentication googleAuth = await googleUser.authentication;
  
  // 3. Create Firebase credential
  final credential = GoogleAuthProvider.credential(
    accessToken: googleAuth.accessToken,
    idToken: googleAuth.idToken,
  );
  
  // 4. Sign in to Firebase
  final userCredential = await FirebaseAuth.instance.signInWithCredential(credential);
  
  // 5. Get Firebase ID token
  final idToken = await userCredential.user!.getIdToken();
  
  // 6. Send to backend
  final response = await ApiClient.post('/auth/google-signin', {
    'idToken': idToken,
  });
  
  final authResponse = AuthResponse.fromJson(response);
  ApiConfig.setAuthToken(authResponse.accessToken);
  return authResponse;
}
```

---


## 2. Projects

Projects are the main organizational unit. All notes, reminders, and uploads belong to a project.

### 2.1 Create Project
**Endpoint:** `POST /projects`  
**Auth Required:** Yes

```dart
// lib/services/project_service.dart
Future<Project> createProject(String name, {String? description}) async {
  final response = await ApiClient.post('/projects', {
    'name': name,
    if (description != null) 'description': description,
  });
  return Project.fromJson(response);
}

// Model
class Project {
  final String id;
  final String name;
  final String? description;
  final String ownerId;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? archivedAt;
  
  Project({
    required this.id,
    required this.name,
    this.description,
    required this.ownerId,
    required this.createdAt,
    required this.updatedAt,
    this.archivedAt,
  });
  
  factory Project.fromJson(Map<String, dynamic> json) => Project(
    id: json['id'],
    name: json['name'],
    description: json['description'],
    ownerId: json['ownerId'],
    createdAt: DateTime.parse(json['createdAt']),
    updatedAt: DateTime.parse(json['updatedAt']),
    archivedAt: json['archivedAt'] != null ? DateTime.parse(json['archivedAt']) : null,
  );
}
```

### 2.2 Get All Projects
**Endpoint:** `GET /projects`  
**Auth Required:** Yes

```dart
Future<List<Project>> getProjects() async {
  final response = await ApiClient.get('/projects');
  return (response as List).map((p) => Project.fromJson(p)).toList();
}
```

### 2.3 Get Single Project
**Endpoint:** `GET /projects/:id`  
**Auth Required:** Yes

```dart
Future<Project> getProject(String projectId) async {
  final response = await ApiClient.get('/projects/$projectId');
  return Project.fromJson(response);
}
```

### 2.4 Update Project
**Endpoint:** `PATCH /projects/:id`  
**Auth Required:** Yes

```dart
Future<Project> updateProject(String projectId, {String? name, String? description}) async {
  final response = await ApiClient.patch('/projects/$projectId', {
    if (name != null) 'name': name,
    if (description != null) 'description': description,
  });
  return Project.fromJson(response);
}
```

### 2.5 Archive Project
**Endpoint:** `PATCH /projects/:id/archive`  
**Auth Required:** Yes

```dart
Future<Project> archiveProject(String projectId) async {
  final response = await ApiClient.patch('/projects/$projectId/archive', {});
  return Project.fromJson(response);
}
```

### 2.6 Delete Project
**Endpoint:** `DELETE /projects/:id`  
**Auth Required:** Yes

```dart
Future<void> deleteProject(String projectId) async {
  await ApiClient.delete('/projects/$projectId');
}
```

---


## 3. Notes

Notes store text content, voice transcriptions, or AI-generated content.

### 3.1 Create Note
**Endpoint:** `POST /notes`  
**Auth Required:** Yes

```dart
// lib/services/note_service.dart
Future<Note> createNote({
  required String projectId,
  required String content,
  List<String>? tags,
}) async {
  final response = await ApiClient.post('/notes', {
    'projectId': projectId,
    'content': content,
    if (tags != null) 'tags': tags,
  });
  return Note.fromJson(response);
}

// Model
class Note {
  final String id;
  final String projectId;
  final String userId;
  final String content;
  final String kind; // TEXT, VOICE, AI
  final DateTime date;
  final List<String> tags;
  final String? audioPath;
  final DateTime createdAt;
  
  Note({
    required this.id,
    required this.projectId,
    required this.userId,
    required this.content,
    required this.kind,
    required this.date,
    required this.tags,
    this.audioPath,
    required this.createdAt,
  });
  
  factory Note.fromJson(Map<String, dynamic> json) => Note(
    id: json['id'],
    projectId: json['projectId'],
    userId: json['userId'],
    content: json['content'],
    kind: json['kind'],
    date: DateTime.parse(json['date']),
    tags: List<String>.from(json['tags'] ?? []),
    audioPath: json['audioPath'],
    createdAt: DateTime.parse(json['createdAt']),
  );
}
```

### 3.2 List Notes
**Endpoint:** `GET /notes?projectId=xxx`  
**Auth Required:** Yes

```dart
Future<List<Note>> getNotes({String? projectId, DateTime? from, DateTime? to}) async {
  final queryParams = <String, String>{};
  if (projectId != null) queryParams['projectId'] = projectId;
  if (from != null) queryParams['from'] = from.toIso8601String();
  if (to != null) queryParams['to'] = to.toIso8601String();
  
  final queryString = queryParams.isNotEmpty 
    ? '?${queryParams.entries.map((e) => '${e.key}=${e.value}').join('&')}'
    : '';
  
  final response = await ApiClient.get('/notes$queryString');
  return (response as List).map((n) => Note.fromJson(n)).toList();
}
```

### 3.3 Create Voice Note (with Transcription)
**Endpoint:** `POST /notes/voice`  
**Auth Required:** Yes  
**Content-Type:** multipart/form-data

```dart
import 'package:http/http.dart' as http;
import 'dart:io';

Future<VoiceNoteResponse> createVoiceNote({
  required String projectId,
  required File audioFile,
  String? tags,
}) async {
  final request = http.MultipartRequest(
    'POST',
    Uri.parse('${ApiConfig.baseUrl}/notes/voice'),
  );
  
  request.headers.addAll({
    'Authorization': 'Bearer ${ApiConfig.authToken}',
  });
  
  request.fields['projectId'] = projectId;
  if (tags != null) request.fields['tags'] = tags;
  
  request.files.add(await http.MultipartFile.fromPath(
    'audio',
    audioFile.path,
  ));
  
  final streamedResponse = await request.send();
  final response = await http.Response.fromStream(streamedResponse);
  
  if (response.statusCode != 201) {
    throw ApiException(response.statusCode, 'Failed to create voice note');
  }
  
  return VoiceNoteResponse.fromJson(jsonDecode(response.body));
}

class VoiceNoteResponse {
  final String noteId;
  final String transcript;
  final String? audioPath;
  
  VoiceNoteResponse({required this.noteId, required this.transcript, this.audioPath});
  
  factory VoiceNoteResponse.fromJson(Map<String, dynamic> json) => VoiceNoteResponse(
    noteId: json['noteId'],
    transcript: json['transcript'],
    audioPath: json['audioPath'],
  );
}
```

---


## 4. Reminders

Reminders are time-based notifications linked to projects.

### 4.1 Create Reminder
**Endpoint:** `POST /reminders`  
**Auth Required:** Yes

```dart
// lib/services/reminder_service.dart
Future<Reminder> createReminder({
  required String projectId,
  required String title,
  required DateTime dueAt,
}) async {
  final response = await ApiClient.post('/reminders', {
    'projectId': projectId,
    'title': title,
    'dueAt': dueAt.toIso8601String(),
  });
  return Reminder.fromJson(response);
}

// Model
class Reminder {
  final String id;
  final String projectId;
  final String userId;
  final String title;
  final DateTime dueAt;
  final String status; // PENDING, COMPLETED, CANCELLED
  final Map<String, dynamic>? recurrenceJson;
  final DateTime createdAt;
  
  Reminder({
    required this.id,
    required this.projectId,
    required this.userId,
    required this.title,
    required this.dueAt,
    required this.status,
    this.recurrenceJson,
    required this.createdAt,
  });
  
  factory Reminder.fromJson(Map<String, dynamic> json) => Reminder(
    id: json['id'],
    projectId: json['projectId'],
    userId: json['userId'],
    title: json['title'],
    dueAt: DateTime.parse(json['dueAt']),
    status: json['status'],
    recurrenceJson: json['recurrenceJson'],
    createdAt: DateTime.parse(json['createdAt']),
  );
}
```

### 4.2 List Reminders
**Endpoint:** `GET /reminders?projectId=xxx`  
**Auth Required:** Yes

```dart
Future<List<Reminder>> getReminders({String? projectId}) async {
  final endpoint = projectId != null ? '/reminders?projectId=$projectId' : '/reminders';
  final response = await ApiClient.get(endpoint);
  return (response as List).map((r) => Reminder.fromJson(r)).toList();
}
```

### 4.3 Get Upcoming Reminders (Next 24 Hours)
**Endpoint:** `GET /reminders/upcoming`  
**Auth Required:** Yes

```dart
Future<List<Reminder>> getUpcomingReminders() async {
  final response = await ApiClient.get('/reminders/upcoming');
  return (response as List).map((r) => Reminder.fromJson(r)).toList();
}
```

### 4.4 Update Reminder (Mark Complete)
**Endpoint:** `PATCH /reminders/:id`  
**Auth Required:** Yes

```dart
Future<Reminder> updateReminder(String reminderId, {String? title, DateTime? dueAt, String? status}) async {
  final response = await ApiClient.patch('/reminders/$reminderId', {
    if (title != null) 'title': title,
    if (dueAt != null) 'dueAt': dueAt.toIso8601String(),
    if (status != null) 'status': status, // PENDING, COMPLETED, CANCELLED
  });
  return Reminder.fromJson(response);
}

// Mark as complete
Future<Reminder> completeReminder(String reminderId) async {
  return updateReminder(reminderId, status: 'COMPLETED');
}
```

### 4.5 Delete Reminder
**Endpoint:** `DELETE /reminders/:id`  
**Auth Required:** Yes

```dart
Future<void> deleteReminder(String reminderId) async {
  await ApiClient.delete('/reminders/$reminderId');
}
```

### 4.6 Send Immediate Notification (Testing)
**Endpoint:** `POST /reminders/:id/notify`  
**Auth Required:** Yes

```dart
Future<void> sendReminderNotification(String reminderId) async {
  await ApiClient.post('/reminders/$reminderId/notify', {});
}
```

---


## 5. AI Chat

The AI assistant can create notes, reminders, calendar events, and import schedules from PDFs.

### 5.1 Chat with AI
**Endpoint:** `POST /ai/chat`  
**Auth Required:** Yes

```dart
// lib/services/ai_service.dart
Future<ChatResponse> chat({
  required String projectId,
  required List<ChatMessage> messages,
  double? temperature,
}) async {
  final response = await ApiClient.post('/ai/chat', {
    'projectId': projectId,
    'messages': messages.map((m) => m.toJson()).toList(),
    if (temperature != null) 'temperature': temperature,
  });
  return ChatResponse.fromJson(response);
}

// Models
class ChatMessage {
  final String role; // 'user' or 'assistant'
  final String content;
  
  ChatMessage({required this.role, required this.content});
  
  Map<String, dynamic> toJson() => {'role': role, 'content': content};
  
  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
    role: json['role'],
    content: json['content'],
  );
}

class ChatResponse {
  final String message;
  final List<ToolResult>? toolResults;
  final Map<String, dynamic>? createdEntities;
  final TokenUsage? usage;
  
  ChatResponse({
    required this.message,
    this.toolResults,
    this.createdEntities,
    this.usage,
  });
  
  factory ChatResponse.fromJson(Map<String, dynamic> json) => ChatResponse(
    message: json['message'] ?? '',
    toolResults: json['toolResults'] != null 
      ? (json['toolResults'] as List).map((t) => ToolResult.fromJson(t)).toList()
      : null,
    createdEntities: json['createdEntities'],
    usage: json['usage'] != null ? TokenUsage.fromJson(json['usage']) : null,
  );
}

class ToolResult {
  final String tool;
  final dynamic result;
  
  ToolResult({required this.tool, required this.result});
  
  factory ToolResult.fromJson(Map<String, dynamic> json) => ToolResult(
    tool: json['tool'],
    result: json['result'],
  );
}

class TokenUsage {
  final int promptTokens;
  final int completionTokens;
  final int totalTokens;
  
  TokenUsage({required this.promptTokens, required this.completionTokens, required this.totalTokens});
  
  factory TokenUsage.fromJson(Map<String, dynamic> json) => TokenUsage(
    promptTokens: json['promptTokens'],
    completionTokens: json['completionTokens'],
    totalTokens: json['totalTokens'],
  );
}
```

### Example: Complete Chat Flow

```dart
// lib/screens/chat_screen.dart
class ChatScreen extends StatefulWidget {
  final String projectId;
  const ChatScreen({required this.projectId});
  
  @override
  _ChatScreenState createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final List<ChatMessage> _messages = [];
  final TextEditingController _controller = TextEditingController();
  bool _isLoading = false;
  
  Future<void> _sendMessage() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    
    setState(() {
      _messages.add(ChatMessage(role: 'user', content: text));
      _isLoading = true;
    });
    _controller.clear();
    
    try {
      final response = await AiService().chat(
        projectId: widget.projectId,
        messages: _messages,
      );
      
      setState(() {
        _messages.add(ChatMessage(role: 'assistant', content: response.message));
        _isLoading = false;
      });
      
      // Handle created entities
      if (response.createdEntities != null) {
        if (response.createdEntities!['reminder'] != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Reminder created!')),
          );
        }
      }
    } catch (e) {
      setState(() => _isLoading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e')),
      );
    }
  }
  
  @override
  Widget build(BuildContext context) {
    // Build your chat UI here
  }
}
```

---


## 6. File Uploads

Upload PDFs for schedule parsing or document storage.

### 6.1 Upload File (Direct)
**Endpoint:** `POST /uploads`  
**Auth Required:** Yes  
**Content-Type:** multipart/form-data

```dart
// lib/services/upload_service.dart
import 'package:http/http.dart' as http;
import 'dart:io';

Future<UploadResponse> uploadFile({
  required String projectId,
  required File file,
  bool isSchedule = false,
  String? scheduleDate,
  String? timezone,
}) async {
  final request = http.MultipartRequest(
    'POST',
    Uri.parse('${ApiConfig.baseUrl}/uploads'),
  );
  
  request.headers.addAll({
    'Authorization': 'Bearer ${ApiConfig.authToken}',
  });
  
  request.fields['projectId'] = projectId;
  request.fields['isSchedule'] = isSchedule.toString();
  if (scheduleDate != null) request.fields['scheduleDate'] = scheduleDate;
  if (timezone != null) request.fields['tz'] = timezone;
  
  request.files.add(await http.MultipartFile.fromPath(
    'file',
    file.path,
  ));
  
  final streamedResponse = await request.send();
  final response = await http.Response.fromStream(streamedResponse);
  
  if (response.statusCode != 201) {
    throw ApiException(response.statusCode, 'Upload failed');
  }
  
  return UploadResponse.fromJson(jsonDecode(response.body));
}

class UploadResponse {
  final String id;
  final String projectId;
  final String storageKey;
  final String mime;
  final int bytes;
  final String parseStatus;
  final String? message;
  
  UploadResponse({
    required this.id,
    required this.projectId,
    required this.storageKey,
    required this.mime,
    required this.bytes,
    required this.parseStatus,
    this.message,
  });
  
  factory UploadResponse.fromJson(Map<String, dynamic> json) => UploadResponse(
    id: json['id'],
    projectId: json['projectId'],
    storageKey: json['storageKey'],
    mime: json['mime'],
    bytes: json['bytes'],
    parseStatus: json['parseStatus'],
    message: json['message'],
  );
}
```

### 6.2 Get Upload Details
**Endpoint:** `GET /uploads/:id`  
**Auth Required:** Yes

```dart
Future<UploadResponse> getUpload(String uploadId) async {
  final response = await ApiClient.get('/uploads/$uploadId');
  return UploadResponse.fromJson(response);
}
```

### Complete Upload + Schedule Import Flow

```dart
// Example: Upload PDF and import schedule via AI
Future<void> uploadAndImportSchedule(String projectId, File pdfFile) async {
  // 1. Upload the PDF
  final upload = await UploadService().uploadFile(
    projectId: projectId,
    file: pdfFile,
    isSchedule: true,
    scheduleDate: DateTime.now().toIso8601String().split('T')[0], // YYYY-MM-DD
    timezone: 'Australia/Sydney',
  );
  
  print('Upload ID: ${upload.id}');
  
  // 2. Ask AI to import the schedule
  final chatResponse = await AiService().chat(
    projectId: projectId,
    messages: [
      ChatMessage(
        role: 'user',
        content: 'Please import the schedule from the PDF I just uploaded and create reminders for all tasks.',
      ),
    ],
  );
  
  print('AI Response: ${chatResponse.message}');
  
  // 3. Check if reminders were created
  if (chatResponse.createdEntities?['schedulePreview'] != null) {
    final preview = chatResponse.createdEntities!['schedulePreview'];
    print('Created ${preview['commitResult']?['createdReminders']?.length ?? 0} reminders');
  }
}
```

---


## 7. Schedule

Manage schedule parsing and event creation.

### 7.1 Get Schedule Preview
**Endpoint:** `GET /schedule/preview?uploadId=xxx`  
**Auth Required:** Yes

```dart
// lib/services/schedule_service.dart
Future<SchedulePreview> getSchedulePreview(String uploadId) async {
  final response = await ApiClient.get('/schedule/preview?uploadId=$uploadId');
  return SchedulePreview.fromJson(response);
}

class SchedulePreview {
  final String uploadId;
  final String projectId;
  final String scheduleDate;
  final String tz;
  final List<ScheduleBlock> blocks;
  final String importHash;
  
  SchedulePreview({
    required this.uploadId,
    required this.projectId,
    required this.scheduleDate,
    required this.tz,
    required this.blocks,
    required this.importHash,
  });
  
  factory SchedulePreview.fromJson(Map<String, dynamic> json) => SchedulePreview(
    uploadId: json['uploadId'],
    projectId: json['projectId'],
    scheduleDate: json['scheduleDate'],
    tz: json['tz'],
    blocks: (json['blocks'] as List).map((b) => ScheduleBlock.fromJson(b)).toList(),
    importHash: json['importHash'],
  );
}

class ScheduleBlock {
  final String title;
  final String? description;
  final String startsAt;
  final String endsAt;
  final List<String>? tags;
  
  ScheduleBlock({
    required this.title,
    this.description,
    required this.startsAt,
    required this.endsAt,
    this.tags,
  });
  
  factory ScheduleBlock.fromJson(Map<String, dynamic> json) => ScheduleBlock(
    title: json['title'],
    description: json['description'],
    startsAt: json['startsAt'],
    endsAt: json['endsAt'],
    tags: json['tags'] != null ? List<String>.from(json['tags']) : null,
  );
  
  Map<String, dynamic> toJson() => {
    'title': title,
    if (description != null) 'description': description,
    'startsAt': startsAt,
    'endsAt': endsAt,
    if (tags != null) 'tags': tags,
  };
}
```

### 7.2 Commit Schedule (Create Events & Reminders)
**Endpoint:** `POST /schedule/commit`  
**Auth Required:** Yes

```dart
Future<ScheduleImportResult> commitSchedule({
  required String uploadId,
  required String projectId,
  required List<ScheduleBlock> blocks,
  bool dryRun = false,
}) async {
  final response = await ApiClient.post('/schedule/commit', {
    'uploadId': uploadId,
    'projectId': projectId,
    'blocks': blocks.map((b) => b.toJson()).toList(),
    'dryRun': dryRun,
  });
  return ScheduleImportResult.fromJson(response);
}

class ScheduleImportResult {
  final List<CreatedEvent> createdEvents;
  final List<CreatedReminder> createdReminders;
  final String importHash;
  
  ScheduleImportResult({
    required this.createdEvents,
    required this.createdReminders,
    required this.importHash,
  });
  
  factory ScheduleImportResult.fromJson(Map<String, dynamic> json) => ScheduleImportResult(
    createdEvents: (json['createdEvents'] as List).map((e) => CreatedEvent.fromJson(e)).toList(),
    createdReminders: (json['createdReminders'] as List).map((r) => CreatedReminder.fromJson(r)).toList(),
    importHash: json['importHash'],
  );
}

class CreatedEvent {
  final String id;
  final String title;
  final String startsAt;
  final String endsAt;
  
  CreatedEvent({required this.id, required this.title, required this.startsAt, required this.endsAt});
  
  factory CreatedEvent.fromJson(Map<String, dynamic> json) => CreatedEvent(
    id: json['id'],
    title: json['title'],
    startsAt: json['startsAt'],
    endsAt: json['endsAt'],
  );
}

class CreatedReminder {
  final String id;
  final String title;
  final String dueAt;
  
  CreatedReminder({required this.id, required this.title, required this.dueAt});
  
  factory CreatedReminder.fromJson(Map<String, dynamic> json) => CreatedReminder(
    id: json['id'],
    title: json['title'],
    dueAt: json['dueAt'],
  );
}
```

---


## 8. Calendar

Connect and manage external calendars (Google, Microsoft).

### 8.1 Get OAuth URL
**Endpoint:** `GET /calendar/auth-url?provider=GOOGLE`  
**Auth Required:** No

```dart
// lib/services/calendar_service.dart
Future<String> getCalendarAuthUrl(String provider) async {
  final response = await ApiClient.get('/calendar/auth-url?provider=$provider');
  return response['authUrl'];
}
```

### 8.2 Connect Calendar
**Endpoint:** `POST /calendar/connect`  
**Auth Required:** Yes

```dart
Future<void> connectCalendar(String provider, String authCode) async {
  await ApiClient.post('/calendar/connect', {
    'provider': provider, // 'GOOGLE' or 'MICROSOFT'
    'authCode': authCode,
  });
}
```

### 8.3 Get Connection Status
**Endpoint:** `GET /calendar/status`  
**Auth Required:** Yes

```dart
Future<CalendarStatus> getCalendarStatus() async {
  final response = await ApiClient.get('/calendar/status');
  return CalendarStatus.fromJson(response);
}

class CalendarStatus {
  final bool connected;
  final String? provider;
  final String? calendarId;
  
  CalendarStatus({required this.connected, this.provider, this.calendarId});
  
  factory CalendarStatus.fromJson(Map<String, dynamic> json) => CalendarStatus(
    connected: json['connected'] ?? false,
    provider: json['provider'],
    calendarId: json['calendarId'],
  );
}
```

### 8.4 Create Calendar Event
**Endpoint:** `POST /calendar/events`  
**Auth Required:** Yes

```dart
Future<Map<String, dynamic>> createCalendarEvent({
  required String summary,
  required DateTime start,
  required DateTime end,
  String? description,
}) async {
  return await ApiClient.post('/calendar/events', {
    'summary': summary,
    'start': {'dateTime': start.toIso8601String()},
    'end': {'dateTime': end.toIso8601String()},
    if (description != null) 'description': description,
  });
}
```

### 8.5 List Calendar Events
**Endpoint:** `GET /calendar/events?timeMin=xxx&timeMax=xxx`  
**Auth Required:** Yes

```dart
Future<List<Map<String, dynamic>>> listCalendarEvents({
  DateTime? timeMin,
  DateTime? timeMax,
}) async {
  final params = <String, String>{};
  if (timeMin != null) params['timeMin'] = timeMin.toIso8601String();
  if (timeMax != null) params['timeMax'] = timeMax.toIso8601String();
  
  final queryString = params.isNotEmpty 
    ? '?${params.entries.map((e) => '${e.key}=${e.value}').join('&')}'
    : '';
  
  final response = await ApiClient.get('/calendar/events$queryString');
  return List<Map<String, dynamic>>.from(response);
}
```

---


## 9. Profile

Manage user profile and preferences.

### 9.1 Get Profile
**Endpoint:** `GET /profile`  
**Auth Required:** Yes

```dart
// lib/services/profile_service.dart
Future<UserProfile> getProfile() async {
  final response = await ApiClient.get('/profile');
  return UserProfile.fromJson(response);
}

class UserProfile {
  final String id;
  final String email;
  final String? displayName;
  final String tier;
  final Map<String, dynamic> notifPrefs;
  final DateTime createdAt;
  
  UserProfile({
    required this.id,
    required this.email,
    this.displayName,
    required this.tier,
    required this.notifPrefs,
    required this.createdAt,
  });
  
  factory UserProfile.fromJson(Map<String, dynamic> json) => UserProfile(
    id: json['id'],
    email: json['email'],
    displayName: json['displayName'],
    tier: json['tier'],
    notifPrefs: json['notifPrefs'] ?? {},
    createdAt: DateTime.parse(json['createdAt']),
  );
}
```

### 9.2 Update Profile
**Endpoint:** `PATCH /profile`  
**Auth Required:** Yes

```dart
Future<UserProfile> updateProfile({String? displayName}) async {
  final response = await ApiClient.patch('/profile', {
    if (displayName != null) 'displayName': displayName,
  });
  return UserProfile.fromJson(response);
}
```

### 9.3 Get Subscription Status
**Endpoint:** `GET /profile/subscription`  
**Auth Required:** Yes

```dart
Future<SubscriptionStatus> getSubscriptionStatus() async {
  final response = await ApiClient.get('/profile/subscription');
  return SubscriptionStatus.fromJson(response);
}

class SubscriptionStatus {
  final String tier; // BASIC, PREMIUM
  final String status; // ACTIVE, CANCELLED, PAST_DUE
  final DateTime? currentPeriodEnd;
  final Map<String, dynamic> limits;
  
  SubscriptionStatus({
    required this.tier,
    required this.status,
    this.currentPeriodEnd,
    required this.limits,
  });
  
  factory SubscriptionStatus.fromJson(Map<String, dynamic> json) => SubscriptionStatus(
    tier: json['tier'] ?? 'BASIC',
    status: json['status'] ?? 'ACTIVE',
    currentPeriodEnd: json['currentPeriodEnd'] != null 
      ? DateTime.parse(json['currentPeriodEnd']) 
      : null,
    limits: json['limits'] ?? {},
  );
}
```

### 9.4 Update Notification Preferences
**Endpoint:** `PATCH /profile/notifications`  
**Auth Required:** Yes

```dart
Future<void> updateNotificationPreferences(Map<String, dynamic> preferences) async {
  await ApiClient.patch('/profile/notifications', preferences);
}

// Example usage
await ProfileService().updateNotificationPreferences({
  'emailNotifications': true,
  'pushNotifications': true,
  'reminderLeadTime': 15, // minutes
});
```

---


## 10. Push Notifications (FCM)

Register device for push notifications. The backend supports multiple platforms (web, android, ios) and stores tokens per platform.

### 10.1 Register FCM Token
**Endpoint:** `POST /webhooks/fcm-token`  
**Auth Required:** Yes

```dart
// lib/services/notification_service.dart
import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';

Future<void> registerFcmToken() async {
  final messaging = FirebaseMessaging.instance;
  
  // Request permission
  final settings = await messaging.requestPermission(
    alert: true,
    badge: true,
    sound: true,
  );
  
  if (settings.authorizationStatus == AuthorizationStatus.authorized) {
    // Get FCM token
    final token = await messaging.getToken();
    
    if (token != null) {
      // Register with backend - include platform for multi-device support
      await ApiClient.post('/webhooks/fcm-token', {
        'token': token,
        'platform': Platform.isAndroid ? 'android' : 'ios',
      });
      print('FCM token registered for ${Platform.operatingSystem}');
    }
  }
}

// Listen for token refresh
void setupTokenRefreshListener() {
  FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
    await ApiClient.post('/webhooks/fcm-token', {
      'token': newToken,
      'platform': Platform.isAndroid ? 'android' : 'ios',
    });
  });
}
```

### 10.2 Get Firebase Config (for initialization)
**Endpoint:** `GET /notifications/firebase-config`  
**Auth Required:** No

```dart
// Fetch Firebase config from backend (useful for dynamic configuration)
Future<Map<String, dynamic>> getFirebaseConfig() async {
  final response = await http.get(
    Uri.parse('${ApiConfig.baseUrl}/notifications/firebase-config'),
  );
  return jsonDecode(response.body);
}
```

### 10.2 Get Recent Notifications
**Endpoint:** `GET /notifications/recent`  
**Auth Required:** Yes

```dart
Future<List<AppNotification>> getRecentNotifications() async {
  final response = await ApiClient.get('/notifications/recent');
  return (response['notifications'] as List)
    .map((n) => AppNotification.fromJson(n))
    .toList();
}

class AppNotification {
  final String id;
  final String title;
  final String body;
  final DateTime? sentAt;
  final Map<String, dynamic> metaJson;
  final DateTime createdAt;
  
  AppNotification({
    required this.id,
    required this.title,
    required this.body,
    this.sentAt,
    required this.metaJson,
    required this.createdAt,
  });
  
  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
    id: json['id'],
    title: json['title'],
    body: json['body'],
    sentAt: json['sentAt'] != null ? DateTime.parse(json['sentAt']) : null,
    metaJson: json['metaJson'] ?? {},
    createdAt: DateTime.parse(json['createdAt']),
  );
}
```

### Complete FCM Setup in Flutter

```dart
// lib/main.dart
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

// Background message handler (must be top-level function)
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  print('Background message: ${message.notification?.title}');
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp();
  
  // Set up background handler
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  
  runApp(MyApp());
}

// In your app initialization
class _MyAppState extends State<MyApp> {
  @override
  void initState() {
    super.initState();
    _setupFCM();
  }
  
  void _setupFCM() {
    // Foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      print('Foreground message: ${message.notification?.title}');
      // Show local notification or snackbar
      _showNotification(message);
    });
    
    // When app is opened from notification
    FirebaseMessaging.onMessageOpenedApp.listen((RemoteMessage message) {
      print('Notification opened: ${message.data}');
      // Navigate to relevant screen
      _handleNotificationTap(message);
    });
  }
  
  void _showNotification(RemoteMessage message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message.notification?.title ?? 'New notification'),
        action: SnackBarAction(
          label: 'View',
          onPressed: () => _handleNotificationTap(message),
        ),
      ),
    );
  }
  
  void _handleNotificationTap(RemoteMessage message) {
    final type = message.data['type'];
    switch (type) {
      case 'reminder_due':
        // Navigate to reminders
        Navigator.pushNamed(context, '/reminders');
        break;
      case 'event_created':
        // Navigate to schedule
        Navigator.pushNamed(context, '/schedule');
        break;
    }
  }
}
```

---


## 11. Error Handling

All API errors follow this format:

```json
{
  "statusCode": 400,
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/endpoint",
  "method": "POST",
  "message": "Error description"
}
```

### Common Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Check request body/params |
| 401 | Unauthorized | Re-authenticate user |
| 403 | Forbidden | User doesn't have permission |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Resource already exists |
| 500 | Server Error | Retry or contact support |

### Flutter Error Handling

```dart
// lib/core/error_handler.dart
class ErrorHandler {
  static String getErrorMessage(dynamic error) {
    if (error is ApiException) {
      switch (error.statusCode) {
        case 401:
          return 'Session expired. Please sign in again.';
        case 403:
          return 'You don\'t have permission to do this.';
        case 404:
          return 'The requested item was not found.';
        case 409:
          return 'This item already exists.';
        default:
          return error.message;
      }
    }
    return 'Something went wrong. Please try again.';
  }
  
  static Future<void> handleAuthError(BuildContext context) async {
    // Clear stored credentials
    ApiConfig.setAuthToken(null);
    await SharedPreferences.getInstance().then((prefs) {
      prefs.remove('auth_token');
      prefs.remove('user');
    });
    
    // Navigate to login
    Navigator.of(context).pushNamedAndRemoveUntil('/login', (route) => false);
  }
}

// Usage in widgets
try {
  final projects = await ProjectService().getProjects();
} on ApiException catch (e) {
  if (e.statusCode == 401) {
    await ErrorHandler.handleAuthError(context);
  } else {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(ErrorHandler.getErrorMessage(e))),
    );
  }
}
```

---

## 12. Complete App Flow Example

Here's how all the pieces fit together:

```dart
// lib/app.dart
class JobMateApp extends StatefulWidget {
  @override
  _JobMateAppState createState() => _JobMateAppState();
}

class _JobMateAppState extends State<JobMateApp> {
  bool _isLoading = true;
  bool _isAuthenticated = false;
  
  @override
  void initState() {
    super.initState();
    _checkAuth();
  }
  
  Future<void> _checkAuth() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    
    if (token != null) {
      ApiConfig.setAuthToken(token);
      
      try {
        // Verify token is still valid
        await ProfileService().getProfile();
        setState(() {
          _isAuthenticated = true;
          _isLoading = false;
        });
        
        // Register FCM token
        await NotificationService().registerFcmToken();
      } catch (e) {
        // Token invalid, clear and show login
        await prefs.remove('auth_token');
        setState(() {
          _isAuthenticated = false;
          _isLoading = false;
        });
      }
    } else {
      setState(() => _isLoading = false);
    }
  }
  
  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return MaterialApp(home: SplashScreen());
    }
    
    return MaterialApp(
      home: _isAuthenticated ? HomeScreen() : LoginScreen(),
      routes: {
        '/login': (_) => LoginScreen(),
        '/home': (_) => HomeScreen(),
        '/projects': (_) => ProjectsScreen(),
        '/chat': (_) => ChatScreen(),
        '/reminders': (_) => RemindersScreen(),
        '/schedule': (_) => ScheduleScreen(),
        '/profile': (_) => ProfileScreen(),
      },
    );
  }
}
```

---

## API Endpoints Quick Reference

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/signup` | Create account | No |
| POST | `/auth/login` | Login | No |
| POST | `/auth/google-signin` | Google login | No |
| GET | `/projects` | List projects | Yes |
| POST | `/projects` | Create project | Yes |
| GET | `/projects/:id` | Get project | Yes |
| PATCH | `/projects/:id` | Update project | Yes |
| DELETE | `/projects/:id` | Delete project | Yes |
| GET | `/notes` | List notes | Yes |
| POST | `/notes` | Create note | Yes |
| POST | `/notes/voice` | Create voice note | Yes |
| GET | `/reminders` | List reminders | Yes |
| POST | `/reminders` | Create reminder | Yes |
| PATCH | `/reminders/:id` | Update reminder | Yes |
| DELETE | `/reminders/:id` | Delete reminder | Yes |
| POST | `/ai/chat` | Chat with AI | Yes |
| POST | `/uploads` | Upload file | Yes |
| GET | `/schedule/preview` | Preview schedule | Yes |
| POST | `/schedule/commit` | Commit schedule | Yes |
| GET | `/calendar/status` | Calendar status | Yes |
| POST | `/calendar/connect` | Connect calendar | Yes |
| GET | `/profile` | Get profile | Yes |
| PATCH | `/profile` | Update profile | Yes |
| POST | `/webhooks/fcm-token` | Register FCM | Yes |
| GET | `/notifications/recent` | Get notifications | Yes |

---

## Firebase Configuration

Add to `android/app/google-services.json` and `ios/Runner/GoogleService-Info.plist` from Firebase Console.

```dart
// Firebase config values (for reference)
const firebaseConfig = {
  'apiKey': 'AIzaSyBqsjyXHLtYUbzUeZ4HnsT8awjoI-BVQ8U',
  'authDomain': 'jobmatee-64027.firebaseapp.com',
  'projectId': 'jobmatee-64027',
  'storageBucket': 'jobmatee-64027.firebasestorage.app',
  'messagingSenderId': '459203161978',
  'appId': '1:459203161978:web:a533a9afaa0819ac44f0c3',
};
```

---

**Note:** All notification titles from the backend will start with "Hey mate!" or "G'day Mate," - this is enforced server-side.
