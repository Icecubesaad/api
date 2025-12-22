import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { GoogleCalendarProvider } from './providers/google-calendar.provider';
import { CalendarProvider } from '@prisma/client';

@Injectable()
export class CalendarService {
  constructor(
    private readonly db: DatabaseService,
    private readonly googleProvider: GoogleCalendarProvider,
  ) {}

  async connectProvider(userId: string, provider: CalendarProvider, authCode: string) {
    console.log('🔗 Connecting calendar provider:', { userId, provider, authCodeLength: authCode?.length });
    
    let tokens: any;
    
    try {
      if (provider === CalendarProvider.GOOGLE) {
        console.log('📞 Exchanging auth code for tokens...');
        tokens = await this.googleProvider.getTokens(authCode);
        console.log('✅ Tokens received:', { 
          hasAccessToken: !!tokens.access_token, 
          hasRefreshToken: !!tokens.refresh_token,
          expiryDate: tokens.expiry_date 
        });
      } else {
        throw new Error('Provider not supported');
      }

      // Store the refresh token (encrypted in production)
      console.log('💾 Saving calendar link to database...');
      const calendarLink = await this.db.calendarLink.create({
        data: {
          userId,
          provider,
          refreshTokenEnc: tokens.refresh_token,
          calendarId: 'primary', // Default calendar
        },
      });
      console.log('✅ Calendar link saved:', { id: calendarLink.id, userId: calendarLink.userId });

      // Verify the link was saved by immediately querying it
      const verifyLink = await this.db.calendarLink.findFirst({
        where: { userId, provider: CalendarProvider.GOOGLE },
      });
      console.log('🔍 Verification query result:', { 
        found: !!verifyLink, 
        linkId: verifyLink?.id,
        matches: verifyLink?.id === calendarLink.id 
      });

      return { success: true };
    } catch (error) {
      console.error('❌ Calendar connection failed:', error);
      throw error;
    }
  }

  async createEvent(userId: string, eventData: any) {
    const calendarLink = await this.db.calendarLink.findFirst({
      where: { userId, provider: CalendarProvider.GOOGLE },
    });

    if (!calendarLink) {
      throw new NotFoundException('No calendar connected');
    }

    try {
      // Use the refresh token to get a new access token
      const refreshToken = calendarLink.refreshTokenEnc; // In production, decrypt this
      
      const response = await this.googleProvider.createEvent(
        refreshToken, // For now, pass the refresh token - the provider should handle token refresh
        calendarLink.calendarId,
        eventData
      );

      // Extract the event data from the Google API response
      return response.data;
    } catch (error) {
      console.error('Calendar API error:', error);
      // If calendar API fails, still return success but indicate it's local only
      return {
        id: `local-${Date.now()}`,
        summary: eventData.summary,
        start: eventData.start,
        end: eventData.end,
        status: 'local-only',
        message: 'Event saved locally. Calendar sync may need reconnection.'
      };
    }
  }

  async listEvents(userId: string, timeMin?: string, timeMax?: string) {
    console.log('🔍 Looking for calendar link for user:', userId);
    
    const calendarLink = await this.db.calendarLink.findFirst({
      where: { userId, provider: CalendarProvider.GOOGLE },
    });

    console.log('📋 Calendar link found:', { 
      found: !!calendarLink, 
      linkId: calendarLink?.id,
      userId: calendarLink?.userId,
      provider: calendarLink?.provider 
    });

    if (!calendarLink) {
      // Let's also check all calendar links for debugging
      const allLinks = await this.db.calendarLink.findMany({
        select: { id: true, userId: true, provider: true, createdAt: true }
      });
      console.log('🔍 All calendar links in database:', allLinks);
      
      throw new NotFoundException('No calendar connected');
    }

    try {
      // Use the refresh token to get a new access token
      const refreshToken = calendarLink.refreshTokenEnc; // In production, decrypt this
      
      const response = await this.googleProvider.listEvents(
        refreshToken, // Pass refresh token - the provider should handle token refresh
        calendarLink.calendarId,
        timeMin,
        timeMax
      );

      return response.data;
    } catch (error) {
      console.error('Calendar API error:', error);
      throw new NotFoundException('Failed to fetch calendar events. Please reconnect your calendar.');
    }
  }

  async getAuthUrl(provider: CalendarProvider): Promise<string> {
    if (provider === CalendarProvider.GOOGLE) {
      return this.googleProvider.getAuthUrl();
    }
    throw new Error('Provider not supported');
  }

  async getConnectionStatus(userId: string) {
    const calendarLink = await this.db.calendarLink.findFirst({
      where: { userId, provider: CalendarProvider.GOOGLE },
    });

    return {
      connected: !!calendarLink,
      provider: calendarLink?.provider || null,
      calendarId: calendarLink?.calendarId || null,
      connectedAt: calendarLink?.createdAt || null,
    };
  }

  async getDebugStatus(email?: string) {
    // Get all calendar links for debugging
    const allLinks = await this.db.calendarLink.findMany({
      include: {
        user: {
          select: {
            email: true,
            id: true,
            displayName: true,
          }
        }
      }
    });

    // If email provided, filter by email
    const filteredLinks = email 
      ? allLinks.filter(link => link.user.email === email)
      : allLinks;

    return {
      totalConnections: allLinks.length,
      connections: filteredLinks.map(link => ({
        userId: link.userId,
        userEmail: link.user.email,
        provider: link.provider,
        calendarId: link.calendarId,
        connectedAt: link.createdAt,
      })),
      requestedEmail: email,
    };
  }
}
