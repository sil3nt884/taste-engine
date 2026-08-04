-- Mood vocabulary version 2: a broader, more diverse hand-curated set (~80 tags)
-- that replaces the 28-tag v1 placeholder. The driving fix: v1 collapsed too many
-- feelings onto a few overloaded tags (notably `cathartic`, which enrichment then
-- applied to every emotional climax — sad dramas AND action finales alike). v2
-- splits each crowded region into distinct, tightly-defined tones so "make me cry"
-- lands on tearjerker/melancholic/heartbreaking, not on an action climax.
--
-- Cutting a NEW version (not editing v1 in place) is deliberate: a frozen version
-- keeps the catalogue speaking one dialect. Enriching against v2 is a full re-run.
INSERT INTO vocabulary (version, model_id, notes, frozen_at)
VALUES (2, 'seed-v2', 'curated diverse set (~80 tags); splits overloaded v1 tones', now())
ON CONFLICT (version) DO NOTHING;

INSERT INTO mood_tag (vocabulary_id, slug, label, definition)
SELECT v.id, x.slug, x.label, x.definition
FROM vocabulary v
CROSS JOIN (VALUES
  -- Sadness / crying
  ('tearjerker',      'Tearjerker',       'Engineered to make you cry; loss, sacrifice or farewell at its core.'),
  ('melancholic',     'Melancholic',      'A quiet, lingering sadness; wistful and reflective rather than acute.'),
  ('bittersweet',     'Bittersweet',      'Joy and sorrow entwined; happy endings that still ache.'),
  ('tragic',          'Tragic',           'Doomed by fate or flaw; suffering that cannot be averted.'),
  ('bleak',           'Bleak',            'Grim and hopeless; offers little comfort or light.'),
  ('poignant',        'Poignant',         'Deeply, tenderly moving; touches a nerve gently.'),
  ('mournful',        'Mournful',         'Steeped in grief and loss; elegiac.'),
  ('wistful',         'Wistful',          'Yearning for what is gone or just out of reach.'),
  ('heartbreaking',   'Heartbreaking',    'Inflicts genuine emotional pain through cruel circumstance.'),
  ('somber',          'Somber',           'Grave and subdued in tone; a heavy stillness.'),
  -- Warmth / comfort
  ('heartwarming',    'Heartwarming',     'Sincere tenderness, kindness and human connection.'),
  ('comforting',      'Comforting',       'Safe and low-stakes; soothes rather than stirs.'),
  ('wholesome',       'Wholesome',        'Kind-hearted and gentle; nothing cynical or cruel.'),
  ('cozy',            'Cozy',             'Small, warm, domestic; iyashikei-adjacent calm.'),
  ('tender',          'Tender',           'Soft and affectionate in its emotional touch.'),
  ('feel-good',       'Feel-good',        'Leaves you lifted and lightly happy.'),
  ('gentle',          'Gentle',           'Unhurried and mild; handles its characters with care.'),
  -- Humour
  ('comedic',         'Comedic',          'Broadly funny; laughter is the main intent.'),
  ('gently-funny',    'Gently funny',     'Light humour woven through without being a full comedy.'),
  ('witty',           'Witty',            'Clever, verbal, quick-footed humour.'),
  ('absurdist',       'Absurdist',        'Nonsensical, surreal comedy that defies logic.'),
  ('satirical',       'Satirical',        'Mocks or critiques through irony and parody.'),
  ('slapstick',       'Slapstick',        'Physical, exaggerated, cartoonish comedy.'),
  ('deadpan',         'Deadpan',          'Dry, understated humour delivered flat.'),
  -- Calm / healing
  ('relaxing',        'Relaxing',         'Calming and unhurried; lowers your pulse.'),
  ('iyashikei',       'Iyashikei',        'Explicitly healing; soothing, restorative slowness.'),
  ('meditative',      'Meditative',       'Contemplative and still; invites reflection.'),
  ('serene',          'Serene',           'Peaceful and untroubled in atmosphere.'),
  ('laid-back',       'Laid-back',        'Easygoing, casual, low-pressure.'),
  ('slow-burn',       'Slow burn',        'Deliberately paced; rewards patience, builds over time.'),
  -- Tension / fear
  ('tense',           'Tense',            'Sustained suspense; keeps you on edge.'),
  ('suspenseful',     'Suspenseful',      'Withholds and teases; dread of what comes next.'),
  ('ominous',         'Ominous',          'Foreboding; a sense that something is wrong.'),
  ('dread',           'Dread',            'Creeping, heavy fear of the inevitable.'),
  ('claustrophobic',  'Claustrophobic',   'Trapped, airless, closing-in pressure.'),
  ('eerie',           'Eerie',            'Strange and unsettling; quietly wrong.'),
  ('terrifying',      'Terrifying',       'Outright frightening; horror-driven fear.'),
  -- Excitement / energy
  ('thrilling',       'Thrilling',        'High-energy excitement and momentum.'),
  ('adrenaline',      'Adrenaline',       'Fast, visceral, edge-of-seat intensity.'),
  ('action-packed',   'Action-packed',    'Dense with combat, chases and spectacle.'),
  ('propulsive',      'Propulsive',       'Constantly moving; hard to pause.'),
  ('high-octane',     'High-octane',      'Relentless pace and energy throughout.'),
  -- Grand / epic
  ('epic',            'Epic',             'Grand scale and stakes; larger than life.'),
  ('sweeping',        'Sweeping',         'Broad, cinematic emotional and visual scope.'),
  ('mythic',          'Mythic',           'Legendary and timeless; larger-than-history feel.'),
  ('operatic',        'Operatic',         'Grand, heightened emotion and spectacle.'),
  ('triumphant',      'Triumphant',       'Hard-won victory; soaring and vindicating.'),
  -- Dark / disturbing
  ('dark',            'Dark',             'Morally or tonally shadowed; cruelty as texture.'),
  ('grim',            'Grim',             'Harsh and unforgiving in outlook.'),
  ('disturbing',      'Disturbing',       'Deliberately unsettling; lingers uncomfortably.'),
  ('brutal',          'Brutal',           'Graphically violent and harsh.'),
  ('nihilistic',      'Nihilistic',       'Bleak conviction that nothing matters.'),
  ('macabre',         'Macabre',          'Preoccupied with death and the grotesque.'),
  ('psychological',   'Psychological',    'Tension from minds, obsession and unravelling.'),
  ('gritty',          'Gritty',           'Rough, grounded, unglamorous realism.'),
  -- Romance
  ('romantic',        'Romantic',         'Centred on love and longing; the feeling of falling.'),
  ('yearning',        'Yearning',         'Aching, unfulfilled desire and pining.'),
  ('swoony',          'Swoony',           'Giddy, butterflies-inducing romance.'),
  ('passionate',      'Passionate',       'Intense, consuming emotional or physical love.'),
  -- Mind
  ('cerebral',        'Cerebral',         'Rewards thought; ideas and intellectual tension.'),
  ('thought-provoking','Thought-provoking','Leaves you turning it over long afterwards.'),
  ('philosophical',   'Philosophical',    'Grapples with meaning, ethics and existence.'),
  ('mind-bending',    'Mind-bending',     'Warps perception, reality or narrative structure.'),
  ('cryptic',         'Cryptic',          'Withholding and puzzle-like; demands decoding.'),
  ('intricate',       'Intricate',        'Densely plotted; many interlocking parts.'),
  -- Whimsy / style
  ('whimsical',       'Whimsical',        'Fanciful, dreamlike, playful lightness.'),
  ('quirky',          'Quirky',           'Offbeat and eccentric in tone.'),
  ('surreal',         'Surreal',          'Dream-logic; unreal, uncanny imagery.'),
  ('stylish',         'Stylish',          'Distinct, cool, aesthetic-forward.'),
  ('atmospheric',     'Atmospheric',      'Mood and place carry it; deeply immersive tone.'),
  ('moody',           'Moody',            'Emotionally shaded and brooding in ambience.'),
  ('campy',           'Campy',            'Knowingly over-the-top and cheesy.'),
  -- Uplift / spirit
  ('inspiring',       'Inspiring',        'Uplifting; moves you to act.'),
  ('uplifting',       'Uplifting',        'Leaves you lighter and hopeful.'),
  ('hopeful',         'Hopeful',          'Holds onto light amid difficulty.'),
  ('nostalgic',       'Nostalgic',        'Evokes memory and the ache of time passing.'),
  ('motivational',    'Motivational',     'Drives you; underdog effort and growth.'),
  ('cathartic',       'Cathartic',        'Releases built-up emotion; earned relief after real strain.')
) AS x(slug, label, definition)
WHERE v.version = 2
ON CONFLICT (vocabulary_id, slug) DO UPDATE
  SET label = EXCLUDED.label, definition = EXCLUDED.definition;
