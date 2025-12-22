import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class GoogleCalendarProvider {
  private oauth2Client: OAuth2Client;

  constructor() {
    // OAuth callback should point to frontend, not backend
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${frontendUrl}/oauth/google/callback`
    );
  }

  getAuthUrl(): string {
    const scopes = ['https://www.googleapis.com/auth/calendar'];
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent screen to ensure refresh token
    });
  }

  async getTokens(code: string) {
    console.log('🔑 Token exchange details:', {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecretLength: process.env.GOOGLE_CLIENT_SECRET?.length,
      redirectUri: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/oauth/google/callback`,
      codeLength: code.length
    });
    
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      return tokens;
    } catch (error) {
      console.error('🚨 Google token exchange failed:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      throw error;
    }
  }

  async createEvent(refreshToken: string, calendarId: string, event: any) {
    // Set refresh token and let Google client handle access token refresh
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    
    return calendar.events.insert({
      calendarId,
      requestBody: event,
    });
  }

  async listEvents(refreshToken: string, calendarId: string, timeMin?: string, timeMax?: string) {
    // Set refresh token and let Google client handle access token refresh
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    
    return calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
    });
  }

  async updateEvent(refreshToken: string, calendarId: string, eventId: string, event: any) {
    // Set refresh token and let Google client handle access token refresh
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    
    return calendar.events.update({
      calendarId,
      eventId,
      requestBody: event,
    });
  }

  async deleteEvent(refreshToken: string, calendarId: string, eventId: string) {
    // Set refresh token and let Google client handle access token refresh
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    
    return calendar.events.delete({
      calendarId,
      eventId,
    });
  }
}
