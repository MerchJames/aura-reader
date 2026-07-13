import { AutoFormatRule, StatRule } from '../types';

export interface RulePreset extends Omit<AutoFormatRule, 'id' | 'enabled'> {
  description: string;
}

export interface StatRulePreset extends Omit<StatRule, 'id' | 'enabled'> {
  description: string;
}

/** Ready-made rules, inspired by common SillyTavern regex scripts. */
export const RULE_PRESETS: RulePreset[] = [
  {
    label: 'Remove reasoning blocks',
    description: 'Strips <think>…</think> chains-of-thought from reasoning models.',
    pattern: '<think(?:ing)?>[\\s\\S]*?</think(?:ing)?>\\s*',
    flags: 'gi',
    replacement: '',
    appliesTo: 'ai',
  },
  {
    label: 'Remove OOC comments',
    description: 'Removes ((OOC: …)) and [OOC: …] out-of-character asides.',
    pattern: '\\s*(?:\\(\\(\\s*OOC:[\\s\\S]*?\\)\\)|\\[\\s*OOC:[^\\]]*\\])',
    flags: 'gi',
    replacement: '',
  },
  {
    label: 'Strip HTML/XML tags',
    description: 'Removes stray markup like <div> or <status> blocks.',
    pattern: '<[^>]+>',
    flags: 'g',
    replacement: '',
  },
  {
    label: 'Remove stat blocks in brackets',
    description: 'Deletes [HP: 20/20] style trackers entirely.',
    pattern: '\\s*\\[[^\\]\\n]*:[^\\]\\n]*\\]',
    flags: 'g',
    replacement: '',
    appliesTo: 'ai',
  },
  {
    label: 'Bold bracketed notes',
    description: 'Renders [Location: Tavern] style tags in bold instead of removing them.',
    pattern: '\\[([^\\]\\n]+)\\]',
    flags: 'g',
    replacement: '**[$1]**',
  },
  {
    label: 'Tame excessive punctuation',
    description: 'Caps runs of !!! or ??? at two.',
    pattern: '([!?])\\1{2,}',
    flags: 'g',
    replacement: '$1$1',
  },
  {
    label: 'Indent dialogue',
    description: 'Adds an indent before quoted lines at the start of a paragraph.',
    pattern: '(^|\\n)("[^"\\n]+")',
    flags: 'g',
    replacement: '$1&nbsp;&nbsp;&nbsp;&nbsp;$2',
  },
  {
    label: 'Remove asterisk actions',
    description: 'Deletes *waves hand* style action text, leaving only prose and dialogue.',
    pattern: '\\*[^*\\n]+\\*[ \\t]*',
    flags: 'g',
    replacement: '',
  },
  {
    label: 'Collapse repeated words',
    description: 'Fixes "the the" style doubled words.',
    pattern: '\\b(\\w+)\\s+\\1\\b',
    flags: 'gi',
    replacement: '$1',
  },
  {
    label: 'Antislop: cut clichés',
    description: 'Deletes worn-out LLM phrases (shivers down the spine, ministrations, a mix of X and Y, voice barely above a whisper, testament to…).',
    pattern: "\\s*(?:sends?\\s+(?:a\\s+)?shivers?\\s+down\\s+(?:his|her|their|your|my)\\s+spine|ministrations|voice\\s+(?:barely|scarcely)\\s+above\\s+a\\s+whisper|a\\s+(?:mix|mixture)\\s+of\\s+[\\w\\s]+?\\s+and\\s+[\\w]+|a\\s+testament\\s+to|can'?t\\s+help\\s+but)",
    flags: 'gi',
    replacement: '',
    appliesTo: 'ai',
  },
  {
    label: 'Antislop: swap a phrase',
    description: 'Template for swapping words/phrases — replaces "a myriad of" with "many". Edit the pattern/replacement to make your own.',
    pattern: '\\ba\\s+myriad\\s+of\\b',
    flags: 'gi',
    replacement: 'many',
  },
];

export const SAMPLE_TEXT = `<think>The user wants a dramatic entrance.</think>*Elara pushes the heavy door open, rain dripping from her cloak.* "You came back," she whispers... "I didn't think you would!!!"
[HP: 18/20] ((OOC: rolling for perception))
She studies {{user}} carefully -- the the silence stretches on.`;

/**
 * A ready-to-demo RPG tracker. Stat rules pull `[Key] value` and `[Key: value]`
 * tokens out of the message and lift them into stat chips/bars above the prose,
 * so an adventure log reads like a game HUD. Health/Mana/Stamina render as bars
 * automatically; everything else (status, location, outfit, coin…) as chips.
 */
export const RPG_STAT_PRESET: StatRulePreset[] = [
  {
    label: 'RPG tracker — [Key] value',
    description: 'Lifts [Health] 100, [Location] Tavern, [Outfit] … tokens into stat chips.',
    pattern: '[{key}] {value}',
    display: 'chips',
  },
  {
    label: 'RPG tracker — [Key: value]',
    description: 'Same, for the [HP: 20/20] / [Status: Poisoned] bracketed style.',
    pattern: '[{key}: {value}]',
    display: 'chips',
  },
];

/** Sample adventure beat that exercises the RPG preset in the live preview. */
export const RPG_SAMPLE_TEXT = `[Health] 100  [Mana] 40  [Stamina] 8/10
[Location] Rain-slick alley behind the Copper Kettle  [Status] Winded, alert
[Outfit] Soaked leather coat, fingerless gloves, worn boots  [Coin] 37g

Elara pressed her back to the cold brick, listening. "They followed us," she breathed. The lantern down the lane swung once, twice — then went dark.`;
