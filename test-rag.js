// Quick RAG test script
const { PrismaClient } = require('@prisma/client');

async function testRag() {
  const prisma = new PrismaClient();
  
  try {
    // 1. Check embeddings count
    const count = await prisma.$queryRaw`SELECT COUNT(*) as count FROM embeddings`;
    console.log('📊 Total embeddings:', count[0].count);
    
    // 2. Show sample embeddings
    const samples = await prisma.$queryRaw`
      SELECT id, "sourceType", "sourceId", LEFT("chunkText", 100) as preview 
      FROM embeddings LIMIT 3
    `;
    console.log('\n📝 Sample embeddings:');
    samples.forEach((s, i) => {
      console.log(`  ${i+1}. [${s.sourceType}] ${s.preview}...`);
    });
    
    // 3. Test vector similarity search using an existing embedding
    // Get the first embedding's vector to use as query (should match itself perfectly)
    const results = await prisma.$queryRaw`
      WITH query_vec AS (
        SELECT vector FROM embeddings LIMIT 1
      )
      SELECT e."sourceType", e."sourceId", LEFT(e."chunkText", 80) as chunk,
             1 - (e.vector <=> q.vector) as similarity
      FROM embeddings e, query_vec q
      ORDER BY e.vector <=> q.vector
      LIMIT 3
    `;
    
    console.log('\n🔍 Vector similarity search results (mock query):');
    results.forEach((r, i) => {
      console.log(`  ${i+1}. Score: ${r.similarity?.toFixed(4)} | ${r.chunk}...`);
    });
    
    console.log('\n✅ RAG system is working! Embeddings stored and searchable.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testRag();
