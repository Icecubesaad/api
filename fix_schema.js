const fs = require('fs');

let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

// Add userId field to DailyLog model
schema = schema.replace(
  'model DailyLog {\n  id              String   @id @default(cuid())\n  projectId       String',
  'model DailyLog {\n  id              String   @id @default(cuid())\n  projectId       String\n  userId          String'
);

// Add user relation to DailyLog model
schema = schema.replace(
  '  // Relations\n  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)',
  '  // Relations\n  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)\n  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)'
);

fs.writeFileSync('prisma/schema.prisma', schema);
console.log('Schema fixed!');
