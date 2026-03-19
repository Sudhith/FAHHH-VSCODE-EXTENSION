const vscode = require('vscode');
const path = require('path');
const { execSync, spawn } = require('child_process');
const fs = require('fs');

let lastPlayedTime = 0;
let previousErrorCount = 0;
let statusBarItem;

/**
 * Play a sound file cross-platform (Windows, macOS, Linux)
 */
function playSound(soundPath) {
  const platform = process.platform;

  try {
    if (platform === 'win32') {
  spawn('powershell', [
    '-ExecutionPolicy', 'Bypass',
    '-c',
    `Add-Type -AssemblyName presentationCore; $player = New-Object System.Windows.Media.MediaPlayer; $player.Open([System.Uri]'${soundPath}'); $player.Play(); Start-Sleep -Seconds 3`
  ], { detached: true, stdio: 'ignore' }).unref();

    } else if (platform === 'darwin') {
      // macOS — use afplay
      spawn('afplay', [soundPath], { detached: true, stdio: 'ignore' }).unref();

    } else {
      // Linux — try paplay, then aplay, then mpg123
      if (commandExists('paplay')) {
        spawn('paplay', [soundPath], { detached: true, stdio: 'ignore' }).unref();
      } else if (commandExists('aplay')) {
        spawn('aplay', [soundPath], { detached: true, stdio: 'ignore' }).unref();
      } else if (commandExists('mpg123')) {
        spawn('mpg123', [soundPath], { detached: true, stdio: 'ignore' }).unref();
      } else {
        vscode.window.showWarningMessage(
          'FAAHHH: Could not play sound. Please install "paplay", "aplay", or "mpg123" on Linux.'
        );
      }
    }
  } catch (err) {
    console.error('FAAHHH extension error playing sound:', err);
  }
}

function commandExists(cmd) {
  try {
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getSoundPath(context) {
  const config = vscode.workspace.getConfiguration('fahhh');
  const customPath = config.get('customSoundPath');

  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  // Use bundled sound — works with both .mp3 and .wav
  const mp3Path = path.join(context.extensionPath, 'sounds', 'fahhh.mp3');
  const wavPath = path.join(context.extensionPath, 'sounds', 'fahhh.wav');

  if (fs.existsSync(mp3Path)) return mp3Path;
  if (fs.existsSync(wavPath)) return wavPath;

  return null;
}

function tryPlayFahhh(context) {
  const config = vscode.workspace.getConfiguration('fahhh');
  if (!config.get('enabled')) return;

  const cooldown = config.get('cooldownMs') || 3000;
  const now = Date.now();

  if (now - lastPlayedTime < cooldown) return; // Cooldown active
  lastPlayedTime = now;

  const soundPath = getSoundPath(context);
  if (!soundPath) {
    vscode.window.showErrorMessage(
      'FAAHHH: Sound file not found! Place a "fahhh.mp3" or "fahhh.wav" in the extension\'s "sounds/" folder.'
    );
    return;
  }

  playSound(soundPath);
}

function updateStatusBar(errorCount) {
  if (errorCount > 0) {
    statusBarItem.text = `$(error) FAAHHH! (${errorCount} error${errorCount > 1 ? 's' : ''})`;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
  } else {
    statusBarItem.text = `$(check) FAAHHH ready`;
    statusBarItem.backgroundColor = undefined;
  }
  statusBarItem.show();
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log('FAAHHH On Error extension is now active!');

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'fahhh.toggle';
  statusBarItem.tooltip = 'Click to toggle FAAHHH sound';
  statusBarItem.text = '$(check) FAAHHH ready';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Listen for diagnostics (errors/warnings) changes
  const diagnosticsListener = vscode.languages.onDidChangeDiagnostics((event) => {
    let totalErrors = 0;

    // Count all errors across all open files
    for (const uri of vscode.workspace.textDocuments.map(d => d.uri)) {
      const diags = vscode.languages.getDiagnostics(uri);
      totalErrors += diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
    }

    updateStatusBar(totalErrors);

    // Only play if errors INCREASED (new error appeared)
    if (totalErrors > previousErrorCount) {
      tryPlayFahhh(context);
    }

    previousErrorCount = totalErrors;
  });

  context.subscriptions.push(diagnosticsListener);

  // Toggle command
  const toggleCmd = vscode.commands.registerCommand('fahhh.toggle', () => {
    const config = vscode.workspace.getConfiguration('fahhh');
    const current = config.get('enabled');
    config.update('enabled', !current, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      `FAAHHH sound is now ${!current ? '🔊 ON' : '🔇 OFF'}`
    );
  });

  // Test sound command
  const testCmd = vscode.commands.registerCommand('fahhh.testSound', () => {
    tryPlayFahhh(context);
    vscode.window.showInformationMessage('FAAHHH! 🔊 Testing sound...');
  });

  context.subscriptions.push(toggleCmd, testCmd);

  vscode.window.showInformationMessage('FAAHHH On Error is active! 🔊 Make an error to test it.');
}

function deactivate() {
  if (statusBarItem) {
    statusBarItem.dispose();
  }
}

module.exports = { activate, deactivate };
