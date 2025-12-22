// Integration test for schedule parsing logic

describe('Schedule Parsing Logic', () => {
  const goldenTestText = `⏰ Morning  
09:00 AM – 09:30 AM 
Check emails and messages 
Review pull requests and updates from the team 
Stand-up meeting prep  

09:30 AM – 10:00 AM 
Daily stand-up meeting with the team  

10:00 AM – 12:00 PM 
Work on assigned feature development (e.g., building React components, styling with Tailwind) 
Fix UI bugs from the backlog  

⏰ Midday  

12:00 PM – 01:00 PM 
Lunch break  

01:00 PM – 03:00 PM 
Continue coding tasks 
Integrate frontend with API endpoints 
Testing and debugging UI issues  

03:00 PM – 03:15 PM 
Short break  

⏰ Afternoon  

03:15 PM – 05:00 PM 
Work on code optimization and performance improvements 
Write unit tests for frontend components 
Collaborate with backend developers if needed  

05:00 PM – 05:30 PM 
Push code to GitHub / GitLab 
Update task board (Jira / Trello)  

⏰ End of Day  

05:30 PM – 06:00 PM 
Review progress vs. planned tasks 
Prepare notes for tomorrow's work 
Team sync-up (if required)`;

  // Helper functions extracted from the service for testing
  const normalizeText = (text: string): string => {
    return text
      .replace(/[–—]/g, '-') // Normalize dashes
      .replace(/\n\s*\n/g, '\n') // Collapse consecutive blank lines
      .split('\n')
      .map(line => line.trim())
      .join('\n');
  };

  const parseTime = (timeStr: string): { hours: number; minutes: number } => {
    // Handle formats like "9:30 AM", "2:15 PM"
    const time12hMatch = timeStr.match(/(\d{1,2}):(\d{2})\s?(AM|PM)/i);
    if (time12hMatch) {
      let hours = parseInt(time12hMatch[1]);
      const minutes = parseInt(time12hMatch[2]);
      const period = time12hMatch[3].toUpperCase();
      
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      
      return { hours, minutes };
    }

    // Handle formats like "10am", "2pm"
    const shortTimeMatch = timeStr.match(/(\d{1,2})\s?(am|pm)/i);
    if (shortTimeMatch) {
      let hours = parseInt(shortTimeMatch[1]);
      const period = shortTimeMatch[2].toUpperCase();
      
      if (period === 'PM' && hours !== 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      
      return { hours, minutes: 0 };
    }
    
    // Handle 24-hour format like "15:30"
    const time24hMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (time24hMatch) {
      return {
        hours: parseInt(time24hMatch[1]),
        minutes: parseInt(time24hMatch[2]),
      };
    }
    
    throw new Error(`Unable to parse time: ${timeStr}`);
  };

  const parseTimeRange = (startStr: string, endStr: string, scheduleDate: string) => {
    const date = new Date(scheduleDate + 'T00:00:00Z'); // Ensure UTC
    
    // Parse start time
    const startTime = parseTime(startStr);
    const startDateTime = new Date(date);
    startDateTime.setUTCHours(startTime.hours, startTime.minutes, 0, 0);
    
    // Parse end time
    const endTime = parseTime(endStr);
    const endDateTime = new Date(date);
    endDateTime.setUTCHours(endTime.hours, endTime.minutes, 0, 0);
    
    // Handle day rollover for times like "11:00 PM - 01:00 AM"
    if (endDateTime <= startDateTime) {
      endDateTime.setUTCDate(endDateTime.getUTCDate() + 1);
    }
    
    return {
      startsAt: startDateTime.toISOString(),
      endsAt: endDateTime.toISOString(),
    };
  };

  const deterministicParse = (text: string, scheduleDate: string) => {
    const normalizedText = normalizeText(text);
    const lines = normalizedText.split('\n');
    
    const blocks: any[] = [];
    let currentBlock: any = null;
    let currentSection = '';

    // Regex patterns for time ranges
    const time12hPattern = /(?<start>\b\d{1,2}:\d{2}\s?(?:AM|PM))\s*[-–—]\s*(?<end>\d{1,2}:\d{2}\s?(?:AM|PM))/i;
    const time24hPattern = /(?<start>\b\d{1,2}:\d{2})\s*[-–—]\s*(?<end>\d{1,2}:\d{2})/;
    const sectionHeaderPattern = /^(⏰\s*)?(Morning|Midday|Afternoon|End of Day)\b/i;

    for (const line of lines) {
      if (!line.trim()) continue;

      // Check for section headers
      const sectionMatch = line.match(sectionHeaderPattern);
      if (sectionMatch) {
        currentSection = sectionMatch[2];
        continue;
      }

      // Check for time ranges
      const timeMatch = line.match(time12hPattern) || line.match(time24hPattern);
      
      if (timeMatch) {
        // Finalize previous block
        if (currentBlock) {
          if (!currentBlock.title) {
            currentBlock.title = 'Scheduled Work Block';
          }
          blocks.push(currentBlock);
        }

        // Start new block
        currentBlock = {
          startsAt: '',
          endsAt: '',
          title: '',
          description: '',
          tags: currentSection ? [currentSection] : [],
        };

        // Parse times
        try {
          const { startsAt, endsAt } = parseTimeRange(
            timeMatch.groups!.start,
            timeMatch.groups!.end,
            scheduleDate
          );
          currentBlock.startsAt = startsAt;
          currentBlock.endsAt = endsAt;
        } catch (error) {
          currentBlock = null;
        }
      } else if (currentBlock && line.trim()) {
        // Add content to current block
        if (!currentBlock.title) {
          currentBlock.title = line.trim();
        } else {
          currentBlock.description = currentBlock.description 
            ? `${currentBlock.description}\n${line.trim()}`
            : line.trim();
        }
      }
    }

    // Finalize last block
    if (currentBlock) {
      if (!currentBlock.title) {
        currentBlock.title = 'Scheduled Work Block';
      }
      blocks.push(currentBlock);
    }

    return { blocks };
  };

  it('should parse the golden test sample into 9+ blocks with correct times', () => {
    const result = deterministicParse(goldenTestText, '2025-09-26');

    expect(result.blocks.length).toBeGreaterThanOrEqual(9);
    
    // Check first block
    const firstBlock = result.blocks[0];
    expect(firstBlock.title).toBe('Check emails and messages');
    expect(firstBlock.tags).toContain('Morning');

    // Check lunch block exists
    const lunchBlock = result.blocks.find(b => b.title.includes('Lunch'));
    expect(lunchBlock).toBeDefined();

    // Check short break exists
    const shortBreak = result.blocks.find(b => b.title.includes('Short break'));
    expect(shortBreak).toBeDefined();

    // Verify all blocks have valid times
    result.blocks.forEach(block => {
      expect(block.startsAt).toBeTruthy();
      expect(block.endsAt).toBeTruthy();
      expect(new Date(block.startsAt).getTime()).toBeLessThan(new Date(block.endsAt).getTime());
    });
  });

  it('should handle various time formats', () => {
    const testCases = [
      { input: '09:00 AM – 09:30 AM', expected: { start: 9, end: 9.5 } },
      { input: '9:30am-10am', expected: { start: 9.5, end: 10 } },
      { input: '15:00–16:30', expected: { start: 15, end: 16.5 } },
      { input: '12:00 PM – 01:00 PM', expected: { start: 12, end: 13 } },
    ];

    testCases.forEach(({ input, expected }) => {
      const result = parseTimeRange(
        input.split(/[-–—]/)[0].trim(),
        input.split(/[-–—]/)[1].trim(),
        '2025-09-26'
      );

      const startHour = new Date(result.startsAt).getUTCHours() + 
                       new Date(result.startsAt).getUTCMinutes() / 60;
      const endHour = new Date(result.endsAt).getUTCHours() + 
                     new Date(result.endsAt).getUTCMinutes() / 60;

      expect(startHour).toBe(expected.start);
      expect(endHour).toBe(expected.end);
    });
  });

  it('should ignore section headers for time parsing but use them for tags', () => {
    const testText = `⏰ Morning
09:00 AM – 09:30 AM
Test task

⏰ Afternoon
02:00 PM – 03:00 PM
Another task`;

    const result = deterministicParse(testText, '2025-09-26');

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0].tags).toContain('Morning');
    expect(result.blocks[1].tags).toContain('Afternoon');
  });

  it('should calculate reminder times correctly', () => {
    const calculateReminderTime = (startsAt: string, endsAt: string): Date => {
      const start = new Date(startsAt);
      const end = new Date(endsAt);
      const duration = end.getTime() - start.getTime();
      const durationMinutes = duration / (1000 * 60);
      
      // For meetings/blocks ≥30min: startsAt - 15min
      // For short tasks <30min: startsAt - 5min
      const leadTimeMinutes = durationMinutes >= 30 ? 15 : 5;
      
      return new Date(start.getTime() - leadTimeMinutes * 60 * 1000);
    };

    // Test 60-minute meeting (should get 15min reminder)
    const longMeetingReminder = calculateReminderTime(
      '2025-09-26T09:00:00Z',
      '2025-09-26T10:00:00Z'
    );
    expect(longMeetingReminder.toISOString()).toBe('2025-09-26T08:45:00.000Z');

    // Test 15-minute break (should get 5min reminder)
    const shortBreakReminder = calculateReminderTime(
      '2025-09-26T15:00:00Z',
      '2025-09-26T15:15:00Z'
    );
    expect(shortBreakReminder.toISOString()).toBe('2025-09-26T14:55:00.000Z');
  });
});