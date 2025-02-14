import { DebateManager } from "./manager";
import type { DebateState, JudgeConfig, DebateConfig } from "./types";
import fs from "fs";
import path from "path";

export class DebateStore {
  private static instance: DebateStore;
  private debates: Map<string, DebateManager>;
  private storageDir: string;

  private constructor() {
    this.debates = new Map();
    this.storageDir = path.resolve(process.cwd(), ".debate-store");
    this.initializeStorage();
  }

  private initializeStorage() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      // Load any existing debates from storage
      const files = fs.readdirSync(this.storageDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const debateId = file.replace(".json", "");
            const data = fs.readFileSync(path.join(this.storageDir, file), "utf-8");
            const state = JSON.parse(data) as DebateState;

            // Validate and ensure required config properties exist
            const config: DebateConfig = {
              proConfig: {
                apiKey: state.config?.proConfig?.apiKey || "",
              },
              conConfig: {
                apiKey: state.config?.conConfig?.apiKey || "",
              },
              judgeConfigs: (state.config?.judgeConfigs || Array(6).fill(null)).map((judge, index) => ({
                apiKey: judge?.apiKey || "",
                name: judge?.name || `评委${index + 1}`
              })) as [JudgeConfig, JudgeConfig, JudgeConfig, JudgeConfig, JudgeConfig, JudgeConfig],
              maxRounds: state.config?.maxRounds || 5,
            };

            // Create debate manager with validated config
            const debate = new DebateManager(
              state.topic,
              state.background || "",
              config,
              (state) => {
                this.persistDebate(state.id, debate);
              },
              (progress) => {
                const state = debate.getState();
                this.persistDebate(state.id, debate);
              }
            );

            // Restore state with validated data
            const validatedState = {
              ...state,
              config,
              background: state.background || "",
              errorMessage: state.errorMessage || null,
              winner: state.winner || null,
              judges: state.judges || [],
              messages: state.messages || [],
            };

            debate.restoreState(validatedState);
            this.debates.set(debateId, debate);
            console.log(`Restored debate ${debateId} from storage`);
          } catch (error) {
            console.error(`Failed to restore debate from ${file}:`, error);
            // Don't delete the file immediately, move it to a backup location
            try {
              const backupDir = path.join(this.storageDir, "backup");
              if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
              }
              fs.renameSync(
                path.join(this.storageDir, file),
                path.join(backupDir, `${file}.${Date.now()}.bak`)
              );
              console.log(`Moved corrupted debate file to backup: ${file}`);
            } catch (e) {
              console.error(`Failed to backup corrupted file ${file}:`, e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to initialize debate storage:", error);
    }
  }

  private persistDebate(debateId: string, debate: DebateManager) {
    const tempFile = path.join(this.storageDir, `${debateId}.tmp.json`);
    const targetFile = path.join(this.storageDir, `${debateId}.json`);
    
    try {
      const state = debate.getState();
      
      // Write to temporary file first with restricted permissions
      fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), {
        encoding: 'utf-8',
        mode: 0o600, // Only owner can read/write
      });
      
      // Then rename to target file (atomic operation)
      fs.renameSync(tempFile, targetFile);
      
      // Set proper permissions for the target file
      fs.chmodSync(targetFile, 0o600);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (cleanupError) {
        console.error(`Failed to clean up temp file for debate ${debateId}:`, cleanupError);
      }
      console.error(`Failed to persist debate ${debateId}:`, error);
    }
  }

  public static getInstance(): DebateStore {
    if (!DebateStore.instance) {
      DebateStore.instance = new DebateStore();
    }
    return DebateStore.instance;
  }

  public async createDebate(topic: string, background: string, config: DebateConfig): Promise<string> {
    let debate: DebateManager | null = null;
    let debateId: string | null = null;
    
    try {
      console.log("Creating new debate with topic:", topic);
      
      // Create debate manager
      debate = new DebateManager(
        topic, 
        background,
        config, 
        (state) => {
          if (debateId && debate) {
            console.log(`Persisting debate ${debateId} after state change`);
            this.persistDebate(debateId, debate);
          }
        },
        (progress) => {
          if (debateId && debate) {
            console.log(`Persisting debate ${debateId} after progress update`);
            const state = debate.getState();
            this.persistDebate(debateId, debate);
          }
        }
      );
      
      debateId = debate.getId();
      console.log(`New debate created with ID: ${debateId}`);
      
      // Ensure storage directory exists
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true, mode: 0o700 });
      }
      
      // Add to memory map first
      this.debates.set(debateId, debate);
      console.log(`Added debate ${debateId} to memory map`);
      
      // Persist initial state
      await this.persistDebateWithRetry(debateId, debate);
      console.log(`Initial state persisted for debate ${debateId}`);

      // Start the debate asynchronously
      debate.start().catch(error => {
        console.error(`Error in debate ${debateId}:`, error);
        if (debate) {
          debate.setErrorStatus(error.message);
          if (debateId) {
            this.persistDebate(debateId, debate);
            // Move errored debate to backup after a delay
            setTimeout(() => {
              if (debateId) this.backupDebate(debateId, "error");
            }, 5000);
          }
        }
      });

      return debateId;
    } catch (error) {
      console.error("Failed to create debate:", error);
      // Clean up if debate was partially created
      if (debateId && debate) {
        try {
          debate.setErrorStatus(error instanceof Error ? error.message : String(error));
          await this.persistDebateWithRetry(debateId, debate);
          await this.backupDebate(debateId, "creation_error");
          this.debates.delete(debateId);
        } catch (cleanupError) {
          console.error(`Failed to clean up debate ${debateId}:`, cleanupError);
        }
      }
      throw error;
    }
  }

  private async persistDebateWithRetry(debateId: string, debate: DebateManager, maxRetries = 3): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Add exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
        }
        
        const tempFile = path.join(this.storageDir, `${debateId}.tmp.json`);
        const targetFile = path.join(this.storageDir, `${debateId}.json`);
        
        // Get debate state
        const state = debate.getState();
        
        // Write to temporary file first
        await fs.promises.writeFile(tempFile, JSON.stringify(state, null, 2), {
          encoding: 'utf-8',
          mode: 0o600
        });
        
        // Rename temp file to target (atomic operation)
        await fs.promises.rename(tempFile, targetFile);
        
        // Set proper permissions
        await fs.promises.chmod(targetFile, 0o600);
        
        console.log(`Successfully persisted debate ${debateId} on attempt ${attempt + 1}`);
        return;
      } catch (error) {
        console.error(`Failed to persist debate ${debateId} (attempt ${attempt + 1}/${maxRetries}):`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Clean up temp file if it exists
        try {
          const tempFile = path.join(this.storageDir, `${debateId}.tmp.json`);
          if (fs.existsSync(tempFile)) {
            await fs.promises.unlink(tempFile);
          }
        } catch (cleanupError) {
          console.error(`Failed to clean up temp file for debate ${debateId}:`, cleanupError);
        }
      }
    }
    
    throw lastError || new Error(`Failed to persist debate ${debateId} after ${maxRetries} attempts`);
  }

  private backupDebate(debateId: string, reason: string): void {
    try {
      const storagePath = path.join(this.storageDir, `${debateId}.json`);
      if (fs.existsSync(storagePath)) {
        const backupDir = path.join(this.storageDir, "backup");
        if (!fs.existsSync(backupDir)) {
          fs.mkdirSync(backupDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        fs.renameSync(
          storagePath,
          path.join(backupDir, `${debateId}.${reason}.${timestamp}.json`)
        );
        console.log(`Backed up debate ${debateId} due to ${reason}`);
      }
    } catch (error) {
      console.error(`Failed to backup debate ${debateId}:`, error);
    }
  }

  public async getDebate(debateId: string): Promise<DebateManager | null> {
    try {
      // First check in-memory cache
      const cachedDebate = this.debates.get(debateId);
      if (cachedDebate) {
        console.log(`Found debate ${debateId} in memory cache`);
        return cachedDebate;
      }

      console.log(`Attempting to restore debate ${debateId} from storage`);
      
      // Check if debate file exists
      const debateFile = path.join(this.storageDir, `${debateId}.json`);
      if (!fs.existsSync(debateFile)) {
        console.log(`Debate file not found for ${debateId}`);
        return null;
      }

      // Read and parse debate file with retries
      const maxRetries = 3;
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            // Add exponential backoff
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
          }

          // Read file with proper error handling
          const data = await fs.promises.readFile(debateFile, { encoding: 'utf-8' });
          const state = JSON.parse(data);

          // Validate debate state structure
          if (!this.isValidDebateState(state)) {
            throw new Error("Invalid debate state structure");
          }

          // Recreate debate manager
          const debate = new DebateManager(
            state.topic,
            state.background,
            state.config,
            (newState) => this.persistDebate(debateId, debate),
            (progress) => this.persistDebate(debateId, debate)
          );

          // Restore state
          debate.restoreState(state);
          
          // Add to memory cache
          this.debates.set(debateId, debate);
          console.log(`Successfully restored debate ${debateId}`);
          
          return debate;
        } catch (error) {
          console.error(`Failed to restore debate ${debateId} (attempt ${attempt + 1}/${maxRetries}):`, error);
          lastError = error instanceof Error ? error : new Error(String(error));
          
          if (attempt === maxRetries - 1) {
            // On final attempt, backup corrupted file
            try {
              await this.backupCorruptedDebate(debateId, lastError.message);
            } catch (backupError) {
              console.error(`Failed to backup corrupted debate ${debateId}:`, backupError);
            }
          }
        }
      }

      throw lastError || new Error(`Failed to restore debate ${debateId}`);
    } catch (error) {
      console.error(`Error in getDebate for ${debateId}:`, error);
      return null;
    }
  }

  private isValidDebateState(state: any): boolean {
    // Basic structure validation
    if (!state || typeof state !== 'object') return false;
    
    // Required fields
    const requiredFields = ['topic', 'background', 'config', 'status', 'messages'];
    if (!requiredFields.every(field => field in state)) return false;
    
    // Type checks
    if (typeof state.topic !== 'string') return false;
    if (typeof state.background !== 'string') return false;
    if (!Array.isArray(state.messages)) return false;
    if (typeof state.status !== 'string') return false;
    if (!['pending', 'active', 'completed', 'error'].includes(state.status)) return false;
    
    // Config validation
    if (!state.config || typeof state.config !== 'object') return false;
    if (!Array.isArray(state.config.judgeConfigs)) return false;
    
    return true;
  }

  private async backupCorruptedDebate(debateId: string, reason: string): Promise<void> {
    try {
      const sourceFile = path.join(this.storageDir, `${debateId}.json`);
      const backupDir = path.join(this.storageDir, 'corrupted');
      
      // Create backup directory if it doesn't exist
      if (!fs.existsSync(backupDir)) {
        await fs.promises.mkdir(backupDir, { recursive: true, mode: 0o700 });
      }
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(backupDir, `${debateId}_${timestamp}_corrupted.json`);
      
      // Copy file to backup location
      await fs.promises.copyFile(sourceFile, backupFile);
      await fs.promises.chmod(backupFile, 0o600);
      
      // Append error information
      const errorInfo = {
        timestamp: new Date().toISOString(),
        reason: reason,
        originalPath: sourceFile
      };
      
      await fs.promises.appendFile(
        backupFile,
        `\n\n/* Error Information:\n${JSON.stringify(errorInfo, null, 2)}\n*/`,
        { encoding: 'utf-8' }
      );
      
      // Remove original file
      await fs.promises.unlink(sourceFile);
      
      console.log(`Backed up corrupted debate ${debateId} to ${backupFile}`);
    } catch (error) {
      console.error(`Failed to backup corrupted debate ${debateId}:`, error);
      throw error;
    }
  }

  public async getDebateState(debateId: string): Promise<DebateState | null> {
    const debate = await this.getDebate(debateId);
    if (!debate) {
      console.log(`Debate ${debateId} not found when getting state`);
      return null;
    }
    const state = debate.getState();
    this.persistDebate(debateId, debate);
    return state;
  }

  public cleanupCompletedDebates(): void {
    let cleaned = 0;
    for (const [id, debate] of this.debates.entries()) {
      const state = debate.getState();
      if (state.status === "completed" || state.status === "error") {
        this.debates.delete(id);
        // Move to backup instead of deleting
        const storagePath = path.join(this.storageDir, `${id}.json`);
        try {
          const backupDir = path.join(this.storageDir, "backup");
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }
          fs.renameSync(
            storagePath,
            path.join(backupDir, `${id}.json.${Date.now()}.bak`)
          );
        } catch (error) {
          console.error(`Failed to backup debate ${id}:`, error);
        }
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} completed/errored debates`);
    }
  }
} 