// Sample work (English). The text was generated with AI. Same structure as sample.ko.js.
export default {
  title: 'The Black Fox’s Winter',
  chapters: [
    ['Chapter 1: First Snow', `On the night the first snow fell on Lumen, Yuna was walking the west gallery of the citadel alone.

Kairen was waiting at the end of the gallery. The Vice-captain’s cloak was dusted with snow that hadn’t yet melted.

“Night patrol again? Doesn’t it seem strange that the Captain only ever gives these jobs to you?”

Yuna shrugged instead of answering. Plenty of people in the order called her the Witch. Kairen was the only one who said it to her face.

“I heard the Witch doesn’t feel the cold.”

“That’s a rumor.” Yuna rubbed her gloved hands together. “Cold is cold.”

As they turned the corner, a small shadow darted across the courtyard below. It was Miro. The boy ran errands for the citadel kitchen; he had no reason to be outside at this hour.

Kairen started to say something, but Yuna was already over the railing.`],
    ['Chapter 2: The Black Forest', `The Black Forest begins beyond Lumen’s northern wall. The knights kept one rule: no one enters the forest after dark. No one but Yuna.

Miro was curled up beneath a fallen oak at the forest’s edge.

“Who told you to come here?”

“A man did. He said he’d give me a silver coin if I found the Black Fox.”

Yuna’s hand froze. Only a handful of people in the order knew that name. Captain Seraphine, and those who had witnessed the pact years ago.

She checked the Fox mask inside her coat. It was still cold. The pact had not woken.

“Let’s go back, Miro. Do you remember his face?”

The boy nodded, then shook his head. He remembered it, he said, but it blurred whenever he tried to picture it. Yuna knew what that meant. Someone had already used magic on him.`],
    ['Chapter 3: Beneath the Mask', `The next morning, the fire in the Captain’s study had gone out.

Seraphine stood at the window and did not turn around. “I hear you went into the forest.”

“There was a child,” Yuna said. “And someone is looking for the Black Fox.”

The Captain’s shoulders stiffened, only slightly. Yuna didn’t miss it. She had never seen the woman they called the Silver Captain afraid of anything.

“Don’t tell Kairen.”

“Is there a reason to keep it from the Vice-captain?”

Only then did Seraphine turn. “Three people signed that pact. Me, you, and one more. Until we know who, trust no one.”

As she left the study, Yuna ran her fingers over the mask again. This time it was lukewarm.`],
  ],
  folders: { side: 'Minor characters', plot: 'Plot ideas' },
  entries: [
    { key: 'yuna', type: 'character', name: 'Yuna', color: '#f58fb0', aliases: ['Witch', 'Black Fox'],
      fields: [
        ['Age', '21'],
        ['Current location', 'Lumen citadel', [[1, 'Black Forest'], [2, 'Lumen citadel (Captain’s study)']]],
        ['Affiliation', 'Royal Knights'],
        ['Belongings', 'Fox mask'],
        ['What they know', 'Nothing yet', [[1, 'Someone is looking for the Black Fox'], [2, 'Three people signed the pact']]],
      ],
      note: 'Only moves at night. Feels the cold badly but never shows it.' },
    { key: 'kairen', type: 'character', name: 'Kairen', color: '#6fb7f2', aliases: ['Vice-captain'],
      fields: [['Age', '27'], ['Current location', 'Lumen'], ['Affiliation', 'Royal Knights (vice-captain)'], ['Personality', 'A stickler for rules. Teases Yuna as “the Witch” but is always the first to look out for her.']] },
    { key: 'seraphine', type: 'character', name: 'Seraphine', color: '#b99bf5', aliases: ['Silver Captain'],
      fields: [['Age', '41'], ['Affiliation', 'Royal Knights (captain)'], ['What they know', 'Suspects who the third signer is']] },
    { key: 'miro', type: 'character', name: 'Miro', color: '#7cc98a', folder: 'side',
      fields: [['Age', '9'], ['Affiliation', 'Errand boy, citadel kitchen'], ['Condition', 'Healthy', [[1, 'Memory blurred by someone’s magic']]]] },
    { key: 'lumen', type: 'place', name: 'Lumen', fields: [['Location', 'Capital of the northern kingdom'], ['Features', 'Long winters. The citadel stands in the middle of the city.']] },
    { key: 'forest', type: 'place', name: 'Black Forest', fields: [['Location', 'Beyond Lumen’s northern wall'], ['Atmosphere', 'No one goes in after dark']] },
    { key: 'knights', type: 'org', name: 'Royal Knights', fields: [['Leader', 'Seraphine'], ['Base', 'Lumen citadel']] },
    { key: 'mask', type: 'item', name: 'Fox mask', fields: [['Owner', 'Yuna'], ['Power', 'Grows warm when the pact wakes'], ['State', 'Cold', [[2, 'Lukewarm — the pact is waking']]]] },
    { key: 'pact', type: 'world', name: 'The Witch’s Pact', fields: [['Summary', 'Witches draw their power from pacts. Those bound by a pact cannot speak each other’s names.']] },
    { key: 'part2', type: 'memo', name: 'Where Part 2 goes', folder: 'plot', note: 'Is the third signer Kairen? → Too obvious? Think of other candidates.' },
  ],
  relations: [
    { a: 'yuna', b: 'kairen', ab: ['A vice-captain who nags too much'], ba: ['Teases her as the Witch, but looks out for her first'] },
    { a: 'yuna', b: 'seraphine', ab: ['The captain she admires'], ba: ['A knight she trusts', [[2, 'A knight she has begun to suspect']]] },
  ],
};
