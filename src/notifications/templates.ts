export type Locale = 'en-AU';

const GREETINGS = ["Hey mate!", "G'day Mate,"] as const;

type TemplateKey =
  | 'dailyCheckIn'
  | 'reminderDue'
  | 'taskCompleted'
  | 'dailySummaryReady'
  | 'welcome';

export const templates = {
  welcomeMessage: (vars?: any) => ({
    title: "G'day Mate! Welcome to JobMate",
    body: "You're all set up and ready to go! I'm here to help you stay organized and productive. Let's get started!",
  }),
  
  reminderDue: (vars: { title: string; dueTime: string }) => ({
    title: "Hey mate! Reminder coming up",
    body: `Don't forget: ${vars.title} is due at ${vars.dueTime}. You've got this!`,
  }),
  
  dailyLogGenerated: (vars: { date: string; projectName: string }) => ({
    title: "G'day Mate! Your daily log is ready",
    body: `I've created your daily log for ${vars.date} in ${vars.projectName}. Great work today!`,
  }),
  
  calendarEventCreated: (vars: { eventTitle: string; startTime: string }) => ({
    title: "Hey mate! New event scheduled",
    body: `"${vars.eventTitle}" has been added to your calendar for ${vars.startTime}. You're all organized!`,
  }),
  
  taskCompleted: (vars: { taskTitle: string }) => ({
    title: "Hey mate! Well done",
    body: `You've completed "${vars.taskTitle}"! Keep up the great work - you're smashing it!`,
  }),
  
  weeklyDigest: (vars: { completedTasks: number; upcomingEvents: number }) => ({
    title: "G'day Mate! Your weekly summary",
    body: `This week you completed ${vars.completedTasks} tasks and have ${vars.upcomingEvents} events coming up. You're doing brilliantly!`,
  }),
  
  pdfProcessed: (vars: { fileName: string }) => ({
    title: "Hey mate! PDF ready to go",
    body: `I've finished processing "${vars.fileName}" and extracted all the key information. Check it out in your project!`,
  }),
  
  aiSuggestion: (vars: { suggestion: string }) => ({
    title: "G'day Mate! I've got an idea",
    body: `Based on your recent activity, here's a suggestion: ${vars.suggestion}. What do you reckon?`,
  }),
  
  scheduleGenerated: (vars: { timeframe: string; projectName: string }) => ({
    title: "Hey mate! Your schedule is ready",
    body: `I've created your ${vars.timeframe} schedule for ${vars.projectName}. Everything's organized and ready to go!`,
  }),
  
  backupReminder: () => ({
    title: "G'day Mate! Time for a backup",
    body: "Just a friendly reminder to back up your important work. Better safe than sorry!",
  }),
  
  motivationalBoost: (vars: { userName?: string }) => ({
    title: "Hey mate! You're doing great",
    body: `${vars.userName ? `${vars.userName}, ` : ''}just wanted to say you're doing an amazing job staying organized. Keep it up!`,
  }),
  
  projectMilestone: (vars: { projectName: string; milestone: string }) => ({
    title: "G'day Mate! Milestone reached",
    body: `Congratulations! You've reached ${vars.milestone} in ${vars.projectName}. That's something to be proud of!`,
  }),
  
  collaborationInvite: (vars: { projectName: string; inviterName: string }) => ({
    title: "Hey mate! You've been invited",
    body: `${vars.inviterName} has invited you to collaborate on "${vars.projectName}". Teamwork makes the dream work!`,
  }),
  
  systemUpdate: (vars: { feature: string }) => ({
    title: "G'day Mate! Something new for you",
    body: `I've got a new feature: ${vars.feature}. Check it out when you get a chance - I think you'll love it!`,
  }),
  
  inactivityNudge: (vars: { daysSinceLastActivity: number }) => ({
    title: "Hey mate! Miss you",
    body: `It's been ${vars.daysSinceLastActivity} days since your last activity. I'm here whenever you're ready to get back into it!`,
  }),
  
  goalAchieved: (vars: { goalTitle: string }) => ({
    title: "G'day Mate! Goal smashed",
    body: `You've achieved your goal: "${vars.goalTitle}"! Time to celebrate - you've earned it!`,
  }),
};

export function assertHasGreetingPrefix(text: string): boolean {
  return GREETINGS.some((g) => text.startsWith(g));
} 