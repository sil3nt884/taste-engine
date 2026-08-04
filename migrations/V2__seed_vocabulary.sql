        -- STARTER mood vocabulary, version 1.
--
-- This is a hand-seeded placeholder so the enrichment pipeline is runnable
-- today. It is NOT the real vocabulary: DESIGN.md §4.1 calls for a discovery
-- pass over ~2,000 titles followed by a manual consolidation to 100-200 tags
-- with written inclusion criteria. Replace this before trusting any number.
--
-- Once frozen, NEVER edit a tag's meaning in place — cut a new vocabulary
-- version instead, or half the catalogue ends up speaking a different dialect.

INSERT INTO vocabulary (version, model_id, notes, frozen_at)
VALUES (1, 'seed-v1', 'hand-seeded starter set — replace with the §4.1 discovery+consolidation output', now())
ON CONFLICT (version) DO NOTHING;

INSERT INTO mood_tag (vocabulary_id, slug, label, definition)
SELECT v.id, x.slug, x.label, x.definition
FROM vocabulary v
CROSS JOIN (VALUES
  ('comforting',    'Comforting',     'Warm, low-stakes, safe to sink into; leaves you settled rather than stirred.'),
  ('melancholy',    'Melancholy',     'A gentle, reflective sadness — wistful, not despairing.'),
  ('bleak',         'Bleak',          'Genuinely grim or hopeless; heavy and hard to shake off.'),
  ('cathartic',     'Cathartic',      'Builds emotional pressure and releases it; makes you cry in a good way.'),
  ('heartwarming',  'Heartwarming',   'Sincere, tender moments of connection, kindness or belonging.'),
  ('funny',         'Funny',          'Broadly comedic; the primary intent is to make you laugh.'),
  ('gently-funny',  'Gently funny',   'Light humour woven through; amusing without being a full comedy.'),
  ('lighthearted',  'Lighthearted',   'Breezy and easy; carries little emotional weight either way.'),
  ('tense',         'Tense',          'Sustained suspense or dread; keeps you on edge.'),
  ('thrilling',     'Thrilling',      'High-energy excitement, adrenaline, momentum.'),
  ('exciting',      'Exciting',       'Eventful and propulsive; hard to pause.'),
  ('epic',          'Epic',           'Grand scale and stakes; sweeping, larger-than-life.'),
  ('dark',          'Dark',           'Morally or tonally shadowed; violence, cruelty, or dread as texture.'),
  ('disturbing',    'Disturbing',     'Deliberately unsettling; lingers uncomfortably.'),
  ('cozy',          'Cozy',           'Small, warm, domestic; slice-of-life calm (iyashikei-adjacent).'),
  ('relaxing',      'Relaxing',       'Calming and unhurried; lowers your pulse.'),
  ('slow-burn',     'Slow burn',      'Deliberately paced; rewards patience, builds over time.'),
  ('bittersweet',   'Bittersweet',    'Happy and sad at once; joy tinged with loss.'),
  ('romantic',      'Romantic',       'Centred on longing, courtship or love; the feeling of falling.'),
  ('nostalgic',     'Nostalgic',      'Evokes memory and the ache of time passing.'),
  ('inspiring',     'Inspiring',      'Uplifting; leaves you motivated or moved to act.'),
  ('quirky',        'Quirky',         'Offbeat, eccentric, playfully strange in tone.'),
  ('whimsical',     'Whimsical',      'Fanciful and imaginative; a dreamlike, playful lightness.'),
  ('sad',           'Sad',            'Straightforwardly sorrowful; grief or loss front and centre.'),
  ('happy',         'Happy',          'Bright and joyful in overall affect.'),
  ('wholesome',     'Wholesome',      'Kind-hearted and gentle; nothing cynical or cruel.'),
  ('melodramatic',  'Melodramatic',   'Heightened, emotionally theatrical; feelings dialled to eleven.'),
  ('cerebral',      'Cerebral',       'Rewards thought; puzzles, ideas, or intellectual tension.')
) AS x(slug, label, definition)
WHERE v.version = 1
ON CONFLICT (vocabulary_id, slug) DO UPDATE
  SET label = EXCLUDED.label, definition = EXCLUDED.definition;
