import { execSync } from 'child_process';
import { join } from 'path';

module.exports = async () => {
  // Ensure Prisma client is generated
  execSync('npx prisma generate', {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
  });
};
