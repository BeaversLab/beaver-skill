export interface ClawPreset {
  id: string;
  label: string;
  defaultSourceDir: string;
  defaultBackupDir: string;
  defaultRestoreDir: string;
  include: string[];
  exclude: string[];
}

export interface BackupRule {
  version: number;
  clawType: string;
  createdAt: string;
  sourceDir: string;
  backupDir: string;
  restoreDir: string;
  include: string[];
  exclude: string[];
}

export interface CreateRuleResult {
  rule: BackupRule;
  rulePath: string;
  needsManualEditing: boolean;
}

export interface BackupResult {
  archivePath: string;
  fileCount: number;
  rulePath: string;
}

export interface RestoreResult {
  archivePath: string;
  targetDir: string;
}
