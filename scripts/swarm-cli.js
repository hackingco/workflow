#!/usr/bin/env node

/**
 * Swarm CLI Entry Point
 * 
 * This script serves as the main entry point for the Swarm CLI.
 * It handles TypeScript compilation and execution in development,
 * and runs the compiled JavaScript in production.
 */

const path = require('path');
const fs = require('fs');

// Check if running in development or production
const isDevelopment = process.env.NODE_ENV !== 'production';

// Determine the CLI entry file
const cliPath = path.resolve(__dirname, '..', 'src', 'cli', 'index.ts');
const compiledPath = path.resolve(__dirname, '..', 'dist', 'cli', 'index.js');

// Check if we're running from a global installation
const isGlobalInstall = __dirname.includes('node_modules/.bin') || 
                       __dirname.includes('node_modules/@hackingco');

// Function to run the CLI
function runCLI() {
  if (isDevelopment && !isGlobalInstall && fs.existsSync(cliPath)) {
    // Development mode - use ts-node
    try {
      // Register ts-node
      require('ts-node').register({
        project: path.resolve(__dirname, '..', 'tsconfig.json'),
        transpileOnly: true,
        compilerOptions: {
          module: 'commonjs'
        }
      });
      
      // Load and run the TypeScript CLI
      require(cliPath);
    } catch (error) {
      console.error('Error running CLI in development mode:', error.message);
      console.error('Make sure ts-node is installed: npm install -D ts-node');
      process.exit(1);
    }
  } else if (fs.existsSync(compiledPath)) {
    // Production mode - use compiled JavaScript
    require(compiledPath);
  } else {
    // Fallback - try to compile on the fly
    console.log('Compiled CLI not found. Attempting to compile...');
    
    const { execSync } = require('child_process');
    try {
      execSync('npm run build:ts', { 
        cwd: path.resolve(__dirname, '..'),
        stdio: 'inherit' 
      });
      
      if (fs.existsSync(compiledPath)) {
        require(compiledPath);
      } else {
        throw new Error('Compilation succeeded but output file not found');
      }
    } catch (error) {
      console.error('Failed to compile CLI:', error.message);
      console.error('Please run "npm run build" first');
      process.exit(1);
    }
  }
}

// Handle uncaught errors gracefully
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the CLI
runCLI();