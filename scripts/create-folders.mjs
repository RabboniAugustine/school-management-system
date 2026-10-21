import { mkdir, readdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";

// SCHOOL MANAGEMENT SYSTEM
// Project Folder Structure Generator
// Version: 1.0.0

const projectRoot = process.cwd();

// Check that we are inside the Next.js project
try {
  await access(join(projectRoot, "package.json"));
} catch {
  console.error(
    "ERROR: Run this script from your project root."
  );

  process.exit(1);
}

// Main project directories
const folders = [

  // Authentication and application routes
  "src/app/(auth)",
  "src/app/(dashboard)",
  "src/app/api",

  // Reusable components
  "src/components/ui",
  "src/components/layout",
  "src/components/shared",

  // Core school management modules
  "src/features/auth",
  "src/features/schools",
  "src/features/academics",
  "src/features/students",
  "src/features/attendance",

  // Shared utilities
  "src/lib/supabase",
  "src/lib/permissions",

  // TypeScript definitions
  "src/types",

  // React hooks
  "src/hooks",

  // Database migrations
  "supabase/migrations",

];

// Generate directories
async function createProjectStructure() {

  console.log("\n=================================");
  console.log("SCHOOL MANAGEMENT SYSTEM");
  console.log("Creating Project Structure...");
  console.log("=================================\n");

  for (const folder of folders) {

    const folderPath = join(projectRoot, folder);

    try {

      await mkdir(folderPath, {
        recursive: true,
      });

      // Keep empty directories visible in Git
      const files = await readdir(folderPath);

      if (files.length === 0) {

        await writeFile(
          join(folderPath, ".gitkeep"),
          ""
        );

      }

      console.log(`✓ Created: ${folder}`);

    } catch (error) {

      console.error(
        `✗ Failed to create ${folder}:`,
        error.message
      );

      throw error;

    }

  }

  console.log("\n=================================");
  console.log("PROJECT STRUCTURE READY!");
  console.log("=================================\n");

}

// Run generator
try {
  await createProjectStructure();
} catch {
  process.exitCode = 1;
}