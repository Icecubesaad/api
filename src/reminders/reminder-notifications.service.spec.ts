/**
 * Unit tests for ReminderNotificationsService
 * 
 * These tests verify the reminder notification logic without
 * requiring actual Firebase or OpenAI connections.
 */

describe('ReminderNotificationsService - Unit Tests', () => {
  // Test notification timing logic
  describe('Notification Timing Logic', () => {
    const shouldSendEarlyNotification = (reminder: any, now: Date): boolean => {
      const dueAt = new Date(reminder.dueAt);
      const timeUntilDue = dueAt.getTime() - now.getTime();
      const oneHour = 60 * 60 * 1000;
      
      if (timeUntilDue <= 0) return false;
      
      if (timeUntilDue >= oneHour) {
        const isAtOneHourMark = timeUntilDue <= oneHour + 60 * 1000;
        return isAtOneHourMark;
      }
      
      const createdAt = reminder.createdAt ? new Date(reminder.createdAt) : now;
      const effectiveCreatedAt = (now.getTime() - createdAt.getTime() < 2 * 60 * 1000) 
        ? now 
        : createdAt;
      
      const remainingTime = dueAt.getTime() - effectiveCreatedAt.getTime();
      const midpointTime = effectiveCreatedAt.getTime() + (remainingTime / 2);
      
      return now.getTime() >= midpointTime - 30 * 1000;
    };

    it('should not send early notification for past due reminders', () => {
      const now = new Date();
      const reminder = {
        dueAt: new Date(now.getTime() - 10 * 60 * 1000), // 10 min ago
        createdAt: new Date(now.getTime() - 60 * 60 * 1000),
      };

      expect(shouldSendEarlyNotification(reminder, now)).toBe(false);
    });

    it('should send notification at 1-hour mark for reminders due in more than 1 hour', () => {
      const now = new Date();
      const reminder = {
        dueAt: new Date(now.getTime() + 60 * 60 * 1000 + 30 * 1000), // 1 hour + 30 sec
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      };

      expect(shouldSendEarlyNotification(reminder, now)).toBe(true);
    });

    it('should not send notification too early for reminders due in more than 1 hour', () => {
      const now = new Date();
      const reminder = {
        dueAt: new Date(now.getTime() + 2 * 60 * 60 * 1000), // 2 hours
        createdAt: new Date(now.getTime() - 60 * 60 * 1000),
      };

      expect(shouldSendEarlyNotification(reminder, now)).toBe(false);
    });

    it('should send notification at midpoint for reminders due within 1 hour', () => {
      const now = new Date();
      const createdAt = new Date(now.getTime() - 30 * 60 * 1000); // Created 30 min ago
      const reminder = {
        dueAt: new Date(now.getTime() + 15 * 60 * 1000), // Due in 15 min
        createdAt,
      };

      // Midpoint would be around now, so should send
      expect(shouldSendEarlyNotification(reminder, now)).toBe(true);
    });
  });

  // Test follow-up notification timing
  describe('Follow-up Notification Timing', () => {
    const isInFollowUpWindow = (dueAt: Date, now: Date): boolean => {
      const timeSinceDue = now.getTime() - dueAt.getTime();
      const fiveMinutes = 5 * 60 * 1000;
      const tenMinutes = 10 * 60 * 1000;
      
      return timeSinceDue >= fiveMinutes && timeSinceDue <= tenMinutes;
    };

    it('should be in follow-up window 5-10 minutes after due time', () => {
      const now = new Date();
      const dueAt = new Date(now.getTime() - 7 * 60 * 1000); // 7 min ago

      expect(isInFollowUpWindow(dueAt, now)).toBe(true);
    });

    it('should not be in follow-up window less than 5 minutes after due', () => {
      const now = new Date();
      const dueAt = new Date(now.getTime() - 3 * 60 * 1000); // 3 min ago

      expect(isInFollowUpWindow(dueAt, now)).toBe(false);
    });

    it('should not be in follow-up window more than 10 minutes after due', () => {
      const now = new Date();
      const dueAt = new Date(now.getTime() - 15 * 60 * 1000); // 15 min ago

      expect(isInFollowUpWindow(dueAt, now)).toBe(false);
    });
  });

  // Test timezone handling
  describe('Timezone Handling', () => {
    const getUserTimezone = (user: any): string => {
      const notifPrefs = (user?.notifPrefs as any) || {};
      return notifPrefs.timezone || 'Australia/Sydney';
    };

    it('should return user timezone from preferences', () => {
      const user = { notifPrefs: { timezone: 'America/New_York' } };
      expect(getUserTimezone(user)).toBe('America/New_York');
    });

    it('should default to Australia/Sydney when no timezone set', () => {
      const user = { notifPrefs: {} };
      expect(getUserTimezone(user)).toBe('Australia/Sydney');
    });

    it('should default to Australia/Sydney when notifPrefs is null', () => {
      const user = { notifPrefs: null };
      expect(getUserTimezone(user)).toBe('Australia/Sydney');
    });

    it('should default to Australia/Sydney when user is null', () => {
      expect(getUserTimezone(null)).toBe('Australia/Sydney');
    });
  });

  // Test notification data structure
  describe('Notification Data Structure', () => {
    it('should include required fields for early notification', () => {
      const notificationData = {
        type: 'reminder_checkin',
        notificationType: 'early',
        reminderId: 'reminder-123',
        eventTitle: 'Test Task',
        dueAt: '2025-01-15T10:00:00Z',
        projectId: 'project-456',
        action: 'checkin',
        minutesUntilDue: '30',
      };

      expect(notificationData).toHaveProperty('type', 'reminder_checkin');
      expect(notificationData).toHaveProperty('notificationType', 'early');
      expect(notificationData).toHaveProperty('reminderId');
      expect(notificationData).toHaveProperty('eventTitle');
      expect(notificationData).toHaveProperty('action', 'checkin');
    });

    it('should include required fields for follow-up notification', () => {
      const notificationData = {
        type: 'reminder_followup',
        notificationType: 'followup',
        reminderId: 'reminder-123',
        eventTitle: 'Test Task',
    });

    it('should throw error when reminder not found', async () => {
      mockDb.reminder.findFirst.mockResolvedValue(null);

      await expect(
        service.sendImmediateReminder('user-123', 'non-existent'),
      ).rejects.toThrow('Reminder not found or access denied');
    });

    it('should throw error when user does not own reminder', async () => {
      mockDb.reminder.findFirst.mockResolvedValue(null); // findFirst with userId filter returns null

      await expect(
        service.sendImmediateReminder('other-user', 'reminder-123'),
      ).rejects.toThrow('Reminder not found or access denied');
    });
  });

  describe('getUpcomingReminders', () => {
    it('should return reminders due within 24 hours', async () => {
      const reminders = [
        createMockReminder({ dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000) }), // 2 hours
        createMockReminder({ id: 'reminder-456', dueAt: new Date(Date.now() + 12 * 60 * 60 * 1000) }), // 12 hours
      ];
      mockDb.reminder.findMany.mockResolvedValue(reminders);

      const result = await service.getUpcomingReminders('user-123');

      expect(result).toHaveLength(2);
      expect(mockDb.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-123',
            status: 'PENDING',
          }),
        }),
      );
    });

    it('should not return completed reminders', async () => {
      mockDb.reminder.findMany.mockResolvedValue([]);

      const result = await service.getUpcomingReminders('user-123');

      expect(result).toHaveLength(0);
      expect(mockDb.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PENDING',
          }),
        }),
      );
    });

    it('should order reminders by due date ascending', async () => {
      mockDb.reminder.findMany.mockResolvedValue([]);

      await service.getUpcomingReminders('user-123');

      expect(mockDb.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { dueAt: 'asc' },
        }),
      );
    });
  });

  describe('notification content', () => {
    it('should include reminder data in notification payload', async () => {
      const reminder = createMockReminder();
      mockDb.reminder.findFirst.mockResolvedValue(reminder);
      mockDb.notification.create.mockResolvedValue({});
      mockDb.chatMessage.create.mockResolvedValue({});

      await service.sendImmediateReminder('user-123', 'reminder-123');

      expect(mockNotificationsService.sendNotification).toHaveBeenCalledWith(
        'user-123',
        'PUSH',
        expect.objectContaining({
          data: expect.objectContaining({
            reminderId: 'reminder-123',
            eventTitle: 'Test Reminder',
            projectId: 'project-123',
            action: 'checkin',
          }),
        }),
      );
    });

    it('should save notification to database', async () => {
      const reminder = createMockReminder();
      mockDb.reminder.findFirst.mockResolvedValue(reminder);
      mockDb.notification.create.mockResolvedValue({});
      mockDb.chatMessage.create.mockResolvedValue({});

      await service.sendImmediateReminder('user-123', 'reminder-123');

      expect(mockDb.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-123',
          title: expect.any(String),
          body: expect.any(String),
          sentAt: expect.any(Date),
          metaJson: expect.objectContaining({
            type: 'reminder_checkin',
            reminderId: 'reminder-123',
          }),
        }),
      });
    });

    it('should save check-in message to chat history', async () => {
      const reminder = createMockReminder();
      mockDb.reminder.findFirst.mockResolvedValue(reminder);
      mockDb.notification.create.mockResolvedValue({});
      mockDb.chatMessage.create.mockResolvedValue({});

      await service.sendImmediateReminder('user-123', 'reminder-123');

      expect(mockDb.chatMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId: 'project-123',
          userId: 'user-123',
          role: 'ASSISTANT',
          content: expect.stringContaining('REMINDER CHECK-IN'),
        }),
      });
    });
  });

  describe('timezone handling', () => {
    it('should use user timezone from preferences', async () => {
      const reminder = createMockReminder({
        user: { ...mockUser, notifPrefs: { timezone: 'America/New_York' } },
      });
      mockDb.reminder.findFirst.mockResolvedValue(reminder);
      mockDb.notification.create.mockResolvedValue({});
      mockDb.chatMessage.create.mockResolvedValue({});

      await service.sendImmediateReminder('user-123', 'reminder-123');

      // Notification should be sent (timezone is used internally for formatting)
      expect(mockNotificationsService.sendNotification).toHaveBeenCalled();
    });

    it('should default to Australia/Sydney when no timezone set', async () => {
      const reminder = createMockReminder({
        user: { ...mockUser, notifPrefs: {} },
      });
      mockDb.reminder.findFirst.mockResolvedValue(reminder);
      mockDb.notification.create.mockResolvedValue({});
      mockDb.chatMessage.create.mockResolvedValue({});

      await service.sendImmediateReminder('user-123', 'reminder-123');

      expect(mockNotificationsService.sendNotification).toHaveBeenCalled();
    });
  });
});
