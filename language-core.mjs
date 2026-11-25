export const DIALOGUE_LANGUAGES = ['zh', 'ja', 'en'];
export function normalizeLanguage(value) { return DIALOGUE_LANGUAGES.includes(value) ? value : 'zh'; }
export function dialogueLanguagePrompt(value) {
  const language = normalizeLanguage(value);
  return '\nOUTPUT LANGUAGE: ' + ({ zh: 'Simplified Chinese (简体中文)', ja: 'Japanese (日本語)', en: 'English' })[language] +
    '. Write all generated spoken lines and narrative prose only in this language. This overrides the language of examples, saved canon, earlier messages and input labels. Preserve proper names, JSON field names, IDs, state codes, keys, continuity markers and revisions exactly; do not translate stored records or rewrite historical messages. ' +
    (language === 'en' ? 'Use natural concise English: at most 260 characters per state line, 64 per short status, 40 per title and 400 per narrative scene or companion reply. Earlier Chinese-character length guidance does not apply.' : language === 'ja' ? '自然な日本語を使い、状態の台詞は1件130文字以内、短い状態名30文字以内、タイトル40文字以内、場面・メッセージ400文字以内。中国語の例文をそのまま返さない。' : '状态台词每句最多90字。');
}
