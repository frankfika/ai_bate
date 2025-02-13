import { DebateManager, DebateConfig } from "./manager";
import { DebateState } from "./types";
import fs from "fs";
import path from "path";

export class DebateStore {
  private static instance: DebateStore;
  private debates: Map<string, DebateManager>;
  private storageDir: string;

  private constructor() {
    this.debates = new Map();
    this.storageDir = path.join(process.cwd(), ".debate-store");
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
            const config = {
              proConfig: {
                apiKey: state.config?.proConfig?.apiKey || "",
                model: state.config?.proConfig?.model || "gpt-4",
              },
              conConfig: {
                apiKey: state.config?.conConfig?.apiKey || "",
                model: state.config?.conConfig?.model || "gpt-4",
              },
              judgeConfig: {
                apiKey: state.config?.judgeConfig?.apiKey || "",
                model: state.config?.judgeConfig?.model || "gpt-4",
              },
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
            // Delete corrupted file
            try {
              fs.unlinkSync(path.join(this.storageDir, file));
              console.log(`Deleted corrupted debate file: ${file}`);
            } catch (e) {
              console.error(`Failed to delete corrupted file ${file}:`, e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to initialize debate storage:", error);
    }
  }

  private persistDebate(debateId: string, debate: DebateManager) {
    try {
      const state = debate.getState();
      fs.writeFileSync(
        path.join(this.storageDir, `${debateId}.json`),
        JSON.stringify(state, null, 2),
        "utf-8"
      );
    } catch (error) {
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
    try {
      console.log("Creating new debate with topic:", topic);
      const debate = new DebateManager(
        topic, 
        background,
        config, 
        (state) => {
          this.persistDebate(state.id, debate);
        },
        (progress) => {
          // Progress updates are handled by the client through the debate state
          const state = debate.getState();
          this.persistDebate(state.id, debate);
        }
      );
      const debateId = debate.getId();
      this.debates.set(debateId, debate);
      this.persistDebate(debateId, debate);
      console.log("Debate created with ID:", debateId);

      // Start the debate asynchronously
      debate.start().catch(error => {
        console.error(`Error in debate ${debateId}:`, error);
        const state = debate.getState();
        if (state.status !== "error") {
          debate.setErrorStatus(error.message);
        }
      });

      return debateId;
    } catch (error) {
      console.error("Failed to create debate:", error);
      throw error;
    }
  }

  public getDebate(debateId: string): DebateManager | null {
    const debate = this.debates.get(debateId);
    if (!debate) {
      // Try to load from storage if not in memory
      const storagePath = path.join(this.storageDir, `${debateId}.json`);
      if (fs.existsSync(storagePath)) {
        try {
          const data = fs.readFileSync(storagePath, "utf-8");
          const state = JSON.parse(data) as DebateState;

          // Validate and ensure required config properties exist
          const config = {
            proConfig: {
              apiKey: state.config?.proConfig?.apiKey || "",
              model: state.config?.proConfig?.model || "gpt-4",
            },
            conConfig: {
              apiKey: state.config?.conConfig?.apiKey || "",
              model: state.config?.conConfig?.model || "gpt-4",
            },
            judgeConfig: {
              apiKey: state.config?.judgeConfig?.apiKey || "",
              model: state.config?.judgeConfig?.model || "gpt-4",
            },
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
          return debate;
        } catch (error) {
          console.error(`Failed to load debate ${debateId} from storage:`, error);
          // Try to clean up corrupted file
          try {
            fs.unlinkSync(storagePath);
            console.log(`Deleted corrupted debate file: ${debateId}.json`);
          } catch (e) {
            console.error(`Failed to delete corrupted file ${debateId}.json:`, e);
          }
        }
      }
      console.log(`Debate ${debateId} not found. Current debates:`, Array.from(this.debates.keys()));
    }
    return debate || null;
  }

  public getDebateState(debateId: string): DebateState | null {
    const debate = this.getDebate(debateId);
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
      if (state.status === "completed") {
        this.debates.delete(id);
        // Remove from storage as well
        const storagePath = path.join(this.storageDir, `${id}.json`);
        try {
          fs.unlinkSync(storagePath);
        } catch (error) {
          console.error(`Failed to delete storage for debate ${id}:`, error);
        }
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} completed debates`);
    }
  }
} 