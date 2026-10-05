import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
const result = spawnSync(process.env.CARGO || `${homedir()}/.cargo/bin/cargo`, ["build", "--manifest-path", "engine/Cargo.toml", "--target", "wasm32-unknown-unknown", "--release", "--locked"], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
mkdirSync("public/wasm", { recursive: true });
copyFileSync("engine/target/wasm32-unknown-unknown/release/rgb_life.wasm", "public/wasm/rgb_life.wasm");
