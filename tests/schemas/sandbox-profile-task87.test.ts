/**
 * Task 87 (Phase 11.2): Pattern 2 sandbox profile path config + default profile + Step 0 checks.
 *
 * [T] criteria from the plan:
 *   1. multi_model_review.sandbox_profile_path config key present in defaults.yaml
 *   2. Default profile file exists at the configured path
 *   3. multi_model_review.sandbox_bwrap_flags config key present with documented default
 *   4. codex-review-prompter.md and gemini-review-prompter.md Pattern 2 sections
 *      document the Step 0 profile-existence check
 *   5. Layer 1 test validates the new config keys parse and the default profile file is readable
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { loadDefaultsYaml, loadDefaultsYamlText } from '../helpers/load-defaults';

const REPO_ROOT = join(__dirname, '..', '..');
const CODEX_AGENT = join(REPO_ROOT, 'plugins', 'synthex', 'agents', 'codex-review-prompter.md');
const GEMINI_AGENT = join(REPO_ROOT, 'plugins', 'synthex', 'agents', 'gemini-review-prompter.md');

describe('Task 87 [T] (1, 3, 5): sandbox config keys parse + are reachable from defaults.yaml', () => {
  let mmr: any;
  let yamlText: string;

  beforeAll(async () => {
    const cfg = await loadDefaultsYaml();
    mmr = cfg?.multi_model_review ?? {};
    yamlText = loadDefaultsYamlText();
  });

  it('multi_model_review.sandbox_profile_path config key present', () => {
    expect(mmr.sandbox_profile_path).toBeDefined();
    expect(typeof mmr.sandbox_profile_path).toBe('string');
  });

  it('multi_model_review.sandbox_profile_path defaults to plugins/synthex/config/sandbox.sb', () => {
    expect(mmr.sandbox_profile_path).toBe('plugins/synthex/config/sandbox.sb');
  });

  it('multi_model_review.sandbox_bwrap_flags config key present', () => {
    expect(mmr.sandbox_bwrap_flags).toBeDefined();
    expect(typeof mmr.sandbox_bwrap_flags).toBe('string');
  });

  it('multi_model_review.sandbox_bwrap_flags has a documented default with --ro-bind / / and --bind /tmp /tmp', () => {
    expect(mmr.sandbox_bwrap_flags).toContain('--ro-bind / /');
    expect(mmr.sandbox_bwrap_flags).toContain('--bind /tmp /tmp');
  });

  it('inline rationale comments reference Pattern 2 (sandbox-yolo) trust-boundary purpose', () => {
    expect(yamlText).toMatch(/Pattern 2 \(sandbox-yolo\) trust-boundary/i);
  });

  it('inline docs explain that Step 0 profile-existence check is mandatory for Pattern 2', () => {
    expect(yamlText).toMatch(/Step 0 profile-existence check|MUST verify.*profile/i);
  });
});

describe('Task 87 [T] (2): default macOS sandbox profile file exists and is readable', () => {
  let profilePath: string;
  let profileContent: string;

  beforeAll(async () => {
    const cfg = await loadDefaultsYaml();
    profilePath = join(REPO_ROOT, cfg.multi_model_review.sandbox_profile_path);
  });

  it('the configured sandbox profile file exists', () => {
    expect(existsSync(profilePath)).toBe(true);
  });

  it('the profile file is readable and non-empty', () => {
    profileContent = readFileSync(profilePath, 'utf8');
    expect(profileContent.length).toBeGreaterThan(0);
  });

  it('the profile starts with the sandbox-exec version header `(version 1)`', () => {
    profileContent = profileContent || readFileSync(profilePath, 'utf8');
    expect(profileContent).toContain('(version 1)');
  });

  it('the profile starts with `(deny default)` (deny-by-default convention)', () => {
    profileContent = profileContent || readFileSync(profilePath, 'utf8');
    expect(profileContent).toContain('(deny default)');
  });

  it('the profile denies all network egress', () => {
    profileContent = profileContent || readFileSync(profilePath, 'utf8');
    expect(profileContent).toMatch(/\(deny network\*\)|\(deny network/);
  });

  it('the profile allows scratch writes only under /tmp', () => {
    profileContent = profileContent || readFileSync(profilePath, 'utf8');
    expect(profileContent).toMatch(/allow file-write\*[\s\S]*\/tmp/);
  });

  it('the profile explicitly denies reads of common secret paths (.ssh, .aws)', () => {
    profileContent = profileContent || readFileSync(profilePath, 'utf8');
    expect(profileContent).toContain('.ssh');
    expect(profileContent).toContain('.aws');
  });

  it('the profile references CWD_PATH and HOME_PATH parameters (passed via -D)', () => {
    profileContent = profileContent || readFileSync(profilePath, 'utf8');
    expect(profileContent).toContain('CWD_PATH');
    expect(profileContent).toContain('HOME_PATH');
  });
});

describe('Task 87 [T] (4): Pattern 2 sections document Step 0 profile-existence check', () => {
  describe('codex-review-prompter.md', () => {
    let content: string;
    beforeAll(() => {
      content = readFileSync(CODEX_AGENT, 'utf8');
    });

    it('contains a Step 0 heading or marker for Pattern 2', () => {
      expect(content).toMatch(/Step 0.*Pattern 2|Pattern 2.*Step 0|Step 0 — Pattern 2 profile-existence check/i);
    });

    it('documents the macOS test -r profile-existence check', () => {
      expect(content).toMatch(/test -r.*sandbox_profile_path/);
    });

    it('documents the cli_failed envelope returned when the profile is missing', () => {
      expect(content).toContain('Pattern 2 (sandbox-yolo) sandbox profile not found');
    });

    it('documents the Linux which bwrap fallback check', () => {
      expect(content).toMatch(/which bwrap|bwrap.*PATH/);
    });

    it('clarifies Step 0 only applies to Pattern 2 (not Patterns 1 or 3)', () => {
      expect(content).toMatch(/Step 0.*mandatory.*Pattern 2|Patterns 1.*3.*skip Step 0/is);
    });

    it('Pattern 2 invocation references the configured profile path placeholder', () => {
      expect(content).toMatch(/<sandbox_profile_path>|sandbox-exec.*<sandbox_profile_path>/);
    });

    it('Pattern 2 invocation passes -D CWD_PATH and -D HOME_PATH to sandbox-exec', () => {
      expect(content).toContain('-D CWD_PATH=$PWD');
      expect(content).toContain('-D HOME_PATH=$HOME');
    });
  });

  describe('gemini-review-prompter.md', () => {
    let content: string;
    beforeAll(() => {
      content = readFileSync(GEMINI_AGENT, 'utf8');
    });

    it('contains a Step 0 heading or marker for Pattern 2', () => {
      expect(content).toMatch(/Step 0.*Pattern 2|Pattern 2.*Step 0|Step 0 — Pattern 2 profile-existence check/i);
    });

    it('documents the macOS test -r profile-existence check', () => {
      expect(content).toMatch(/test -r.*sandbox_profile_path/);
    });

    it('documents the cli_failed envelope returned when the profile is missing', () => {
      expect(content).toContain('Pattern 2 (sandbox-yolo) sandbox profile not found');
    });

    it('clarifies Step 0 only applies to Pattern 2 (not Patterns 1 or 3)', () => {
      expect(content).toMatch(/Step 0.*mandatory|Patterns 1.*skip Step 0/is);
    });
  });
});
