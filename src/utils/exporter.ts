import { Story } from '../types';

export const storyToMarkdown = (story: Story): string => {
  const lines: string[] = [`# ${story.title}`, ''];
  if (story.characterName || story.userName) {
    lines.push(
      [
        story.characterName ? `**Character:** ${story.characterName}` : null,
        story.userName ? `**User:** ${story.userName}` : null,
      ].filter(Boolean).join(' · '),
      '',
    );
  }
  story.messages.forEach(msg => {
    if (story.format !== 'kobold') lines.push(`### ${msg.name}`, '');
    lines.push(msg.content.trim(), '');
  });

  if (story.highlights?.length) {
    lines.push('---', '', '## Highlights', '');
    story.highlights.forEach(h => lines.push(`> ${h.text}`, ''));
  }
  return lines.join('\n');
};

export const downloadText = (filename: string, text: string) => {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const safeFilename = (title: string) =>
  title.replace(/[^\w\d-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'story';
