import { PrismaClient, UserRole, SubscriptionTier, SubscriptionStatus, NoteKind, ReminderStatus, AuthProvider } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create demo user
  const demoPassword = await bcrypt.hash('demo-password', 10);

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@jobmate.com' },
    update: {},
    create: {
      email: 'demo@jobmate.com',
      displayName: 'Demo User',
      firebaseUid: 'demo-firebase-uid-123',
      password: demoPassword,
      authProvider: AuthProvider.FIREBASE,
      role: UserRole.USER,
      tier: SubscriptionTier.PREMIUM,
      notifPrefs: {
        push: true,
        email: true,
        dailyReminders: true,
      },
    },
  });

  console.log('✅ Created demo user:', demoUser.email);

  // Create demo project
  const demoProject = await prisma.project.upsert({
    where: { id: 'demo-project-1' },
    update: {},
    create: {
      id: 'demo-project-1',
      name: 'My Daily Work',
      description: 'A sample project to demonstrate JobMate features',
      ownerId: demoUser.id,
    },
  });

  console.log('✅ Created demo project:', demoProject.name);

  // Create demo notes
  const demoNotes = await Promise.all([
    prisma.note.create({
      data: {
        projectId: demoProject.id,
      userId: demoUser.id,
        content: 'Started working on the new feature implementation. Need to review the requirements document.',
        kind: NoteKind.TEXT,
        tags: ['work', 'feature', 'requirements'],
      },
    }),
    prisma.note.create({
      data: {
        projectId: demoProject.id,
      userId: demoUser.id,
        content: 'Meeting with the team went well. Discussed timeline and deliverables for Q1.',
        kind: NoteKind.TEXT,
        tags: ['meeting', 'team', 'timeline'],
      },
    }),
    prisma.note.create({
      data: {
        projectId: demoProject.id,
      userId: demoUser.id,
        content: 'AI-generated summary: Key tasks identified include code review, testing, and documentation.',
        kind: NoteKind.AI,
        tags: ['ai', 'summary', 'tasks'],
      },
    }),
  ]);

  console.log('✅ Created demo notes:', demoNotes.length);

  // Create demo reminders
  const demoReminders = await Promise.all([
    prisma.reminder.create({
      data: {
        projectId: demoProject.id,
      userId: demoUser.id,
        title: 'Review code changes',
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        status: ReminderStatus.PENDING,
      },
    }),
    prisma.reminder.create({
      data: {
        projectId: demoProject.id,
      userId: demoUser.id,
        title: 'Team standup meeting',
        dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // In 2 hours
        status: ReminderStatus.PENDING,
      },
    }),
  ]);

  console.log('✅ Created demo reminders:', demoReminders.length);

  // Create demo daily log
  const demoDailyLog = await prisma.dailyLog.create({
    data: {
      projectId: demoProject.id,
      userId: demoUser.id,
      date: new Date(),
      summary: 'Productive day working on feature implementation. Reviewed requirements and had productive team meeting.',
      tasksJson: [
        'Review requirements document',
        'Attend team meeting',
        'Plan implementation timeline',
      ],
      sourceRefsJson: {
        noteIds: demoNotes.map(note => note.id),
        uploadIds: [],
      },
    },
  });

  console.log('✅ Created demo daily log');

  // Create demo subscription
  const demoSubscription = await prisma.subscription.create({
    data: {
      userId: demoUser.id,
      status: SubscriptionStatus.ACTIVE,
      tier: SubscriptionTier.PREMIUM,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      limits: {
        aiCallsPerDay: 100,
        fileUploadsPerDay: 10,
        pdfExportsPerMonth: 50,
      },
    },
  });

  console.log('✅ Created demo subscription');

  // Create demo notification
  const demoNotification = await prisma.notification.create({
    data: {
      userId: demoUser.id,
      title: 'Hey mate!',
      body: 'Welcome to JobMate! Your daily assistant is ready to help you stay organized.',
      sentAt: new Date(),
      metaJson: {
        type: 'welcome',
        projectId: demoProject.id,
        userId: demoUser.id,
      },
    },
  });

  console.log('✅ Created demo notification');

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`- Users: 1`);
  console.log(`- Projects: 1`);
  console.log(`- Notes: ${demoNotes.length}`);
  console.log(`- Reminders: ${demoReminders.length}`);
  console.log(`- Daily Logs: 1`);
  console.log(`- Subscriptions: 1`);
  console.log(`- Notifications: 1`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
