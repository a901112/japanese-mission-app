function validateQuestionBank(questions) {
  const errors = [];
  const ids = new Set();
  questions.forEach((q, index) => {
    const label = q.id || `index:${index}`;
    if (!q.id) errors.push(`${label}: missing id`);
    if (ids.has(q.id)) errors.push(`${label}: duplicate id`);
    ids.add(q.id);
    if (!q.level) errors.push(`${label}: missing level`);
    if (!q.scene) errors.push(`${label}: missing scene`);
    if (!q.questionType) errors.push(`${label}: missing questionType`);
    if (!Array.isArray(q.choices) || q.choices.length < 4) errors.push(`${label}: choices must be at least 4`);
    if (typeof q.answerIndex !== 'number' || q.answerIndex < 0 || q.answerIndex >= q.choices.length) errors.push(`${label}: invalid answerIndex`);
    if (q.choices && new Set(q.choices).size !== q.choices.length) errors.push(`${label}: duplicate choices`);
    if (!q.explanation) errors.push(`${label}: missing explanation`);
    if (!q.grammarTags || !q.grammarTags.length) errors.push(`${label}: missing grammarTags`);
    if (!q.confusionType || !q.confusionType.length) errors.push(`${label}: missing confusionType`);
  });
  return { valid: errors.length === 0, errors };
}
