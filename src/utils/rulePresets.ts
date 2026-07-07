import { AutoFormatRule } from '../types';

export interface RulePreset extends Omit<AutoFormatRule, 'id' | 'enabled'> {
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
];

export const SAMPLE_TEXT = `<think>The user wants a dramatic entrance.</think>*Elara pushes the heavy door open, rain dripping from her cloak.* "You came back," she whispers... "I didn't think you would!!!"
[HP: 18/20] ((OOC: rolling for perception))
She studies {{user}} carefully -- the the silence stretches on.`;
