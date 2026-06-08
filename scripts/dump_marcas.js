const fs = require('fs');
const path = require('path');

// Carrega .env manualmente (se existir)
try {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const txt = fs.readFileSync(envPath, 'utf8');
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
} catch (e) {
  // ignore
}

(async () => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const marcas = await prisma.marca.findMany({ select: { id: true, nome: true, corPrimaria: true, corFundo: true, paleta: true, logoUrl: true } });
    console.log(JSON.stringify(marcas, null, 2));
    await prisma.$disconnect();
  } catch (e) {
    console.error('ERRO:', e.message || e);
    process.exit(1);
  }
})();
