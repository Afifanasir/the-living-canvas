// The museum's contents. Paintings and portraits are public domain (Wikimedia Commons; credits in raw/**/source.txt).
// x, y, w, h are fractions (0–1) of the painting, measured from its top-left.
// Hotspot and clue positions were measured on a percentage grid over each painting.

/** A speaking figure. x, y: the centre of their body, as fractions of the painting. dry: heard with no room reverb
 *  (Vermeer, at the listener's shoulder). */
export type Hotspot = { id: string; character: string; x: number; y: number; line: string; dry?: boolean };
/** A forensic clue for the loupe hunt: `hint` says where to look; `name` and `note` unlock when the lens finds it. */
export type Technique = {
  id: string; name: string; hint: string; x: number; y: number; w: number; h: number; note: string;
  /** For a clue bigger than the glass: lines (fractions of the painting) traced over the painting once it is found. */
  outline?: [number, number][][];
};

export type Exhibit = {
  slug: string;
  period: string; // wing id
  artist: string;
  /** The name visitors know the artist by ("Leonardo", "Van Gogh"). */
  known: string;
  artistLife: string;
  artistNote: string;
  /** Two short lines about the artist, engraved on the plaque under the portrait. */
  artistBlurb: string;
  /** Shown in the artist's frame on the wing wall. */
  portrait: string;
  /** Set when no authentic portrait exists and the frame shows a detail of the painting instead. */
  portraitNote?: string;
  title: string;
  year: string;
  medium: string;
  location: string;
  about: string;
  hook: string;
  dilemma: string;
  /** The piece that plays in this room. Audio file: public/audio/music/<slug>.mp3 (supplied, licensed). */
  /** The room's music, credited at the foot of the room: the piece, and who plays it in this recording. */
  soundtrack: { piece: string; players?: string };
  ratio: number; // width / height of the painting
  hotspots: Hotspot[];
  techniques: Technique[];
};

/** A wing. intro: what the period was; teaser: the two paintings in this wing, ending on the question they pose. */
export type Period = { id: string; numeral: string; name: string; years: string; theme: string; intro: string; teaser: string };

export const periods: Period[] = [
  {
    id: "renaissance",
    numeral: "I",
    name: "The High Renaissance",
    years: "c. 1490–1525",
    theme: "The Weight of Knowing",
    intro:
      "In barely thirty years, Italian painters mastered anatomy, perspective and gesture, staging sacred stories as real moments where every glance carries meaning.",
    teaser:
      "A betrayal is seconds from being named; a man of clay is seconds from waking.",
  },
  {
    id: "baroque",
    numeral: "II",
    name: "The Baroque",
    years: "c. 1600–1750",
    theme: "Light and Pretence",
    intro:
      "The Baroque turned painting into theatre: a single hard light cuts through deep shadow and catches everyone mid-step, mid-glance, mid-breath.",
    teaser:
      "A militia struts into the spotlight dressed as heroes; a girl turns toward you. Who is performing?",
  },
  {
    id: "romanticism",
    numeral: "III",
    name: "Romanticism",
    years: "c. 1780–1850",
    theme: "What Power Devours",
    intro:
      "After the revolutions, painters trusted feeling over reason. They chose terror, passion and the sublime over calm order, painting violence, madness and freedom with loose, urgent brushwork.",
    teaser:
      "A god devours his son to keep his throne; a goddess climbs over the dead to lead the living. Who pays for power?",
  },
  {
    id: "expressionism",
    numeral: "IV",
    name: "Post-Impressionism & Expressionism",
    years: "c. 1885–1910",
    theme: "The Sky Inside",
    intro:
      "Painters stopped painting what they saw and began painting what they felt. Colour and line bent to the mind: skies swirl, faces dissolve, and the land itself seems to cry out.",
    teaser:
      "A night sky boils above a sleeping village; a sunset turns to blood above a fjord. Whose eyes are you seeing through?",
  },
];

export const exhibits: Exhibit[] = [
  {
    slug: "davinci-last-supper",
    period: "renaissance",
    artist: "Leonardo da Vinci",
    known: "Leonardo",
    artistLife: "Italian, 1452–1519",
    artistNote:
      "Painter, engineer and anatomist, Leonardo studied faces the way others studied scripture. He painted The Last Supper straight onto a refectory wall with an experimental technique that began flaking in his own lifetime.",
    artistBlurb: "Painter, engineer and anatomist, who studied faces the way others studied scripture.",
    portrait: "/artists/davinci.webp",
    title: "The Last Supper",
    year: "1495–1498",
    medium: "Tempera and oil on plaster",
    location: "Santa Maria delle Grazie, Milan",
    about:
      "Leonardo freezes the instant after Christ says that one of the twelve will betray him. Shock, denial and fear ripple outward in groups of three. Only Judas leans back into shadow, a purse in his fist.",
    hook: "A frozen crime scene: shock, denial and terror ripple through twelve men seconds before the betrayal is sealed.",
    dilemma:
      "If scripture decreed that Christ had to die to redeem humankind, did Judas act from free will and pure evil, or was he an instrument in a divine script he could not escape?",
    soundtrack: { piece: "Josquin des Prez, Mille regretz", players: "Ensemble Clément Janequin" },
    ratio: 1.919,
    hotspots: [
      {
        id: "judas",
        character: "Judas Iscariot",
        x: 0.297,
        y: 0.6,
        line: "Quiet! Don't look at my hands. Thirty pieces of silver... do you have any idea what it means to be the only realist in a room full of dreamers? He looked straight at me and said, 'One of you will betray me.' He already knows. The salt is spilled, the die is cast, and heaven will not save any of us from Rome.",
      },
      {
        id: "peter",
        character: "Saint Peter",
        x: 0.336,
        y: 0.59,
        line: "Tell me his name, John! Ask Him who it is! I swear on the living God, before this night is out, whichever snake among us has sold the Master will feel this blade across his throat. Let Rome come. They will have to cut through me first.",
      },
    ],
    techniques: [
      { id: "salt", name: "Judas's table", hint: "Find Judas: the dark figure leaning back, fourth from the left. Look at his arm on the table.", x: 0.2725, y: 0.6025, w: 0.075, h: 0.085, note: "By Judas's right forearm, an overturned salt cellar spills white crystals: a Renaissance omen of a broken covenant. His knuckles whiten around a dark purse holding thirty pieces of silver." },
      { id: "knife", name: "Peter's concealed blade", hint: "Look behind Judas's back. Whose hand is hidden there, and what does it hold?", x: 0.215, y: 0.6, w: 0.05, h: 0.065, note: "Peter leans hard behind John, his right hand cocked behind his back around an unsheathed knife, ready for whoever is accused." },
    ],
  },
  {
    slug: "michelangelo-creation-of-adam",
    period: "renaissance",
    artist: "Michelangelo Buonarroti",
    known: "Michelangelo",
    artistLife: "Italian, 1475–1564",
    artistNote:
      "Sculptor first, painter by papal order. Michelangelo spent four years on scaffolding under the Sistine Chapel vault, painting more than three hundred figures, and dissected corpses to understand the bodies he carved and painted.",
    artistBlurb: "A sculptor first and a painter by papal order, he spent four years on the Sistine vault.",
    portrait: "/artists/michelangelo.webp",
    title: "The Creation of Adam",
    year: "c. 1511–1512",
    medium: "Fresco",
    location: "Sistine Chapel, Vatican City",
    about:
      "God, borne by a swirl of angels in a billowing red mantle, stretches toward Adam reclining on bare earth. Their fingers almost meet. The gap between them is the most famous empty space in art.",
    hook: "Consciousness passed on not as magic dust, but as the raw burden of a mind waking out of dead clay.",
    dilemma:
      "Did God give humanity divine intelligence, or did the human brain invent God? And why is Adam's finger limp: is he hesitating to accept the suffering and accountability of being conscious?",
    soundtrack: { piece: "Giovanni Pierluigi da Palestrina, Missa Papae Marcelli: Kyrie" },
    ratio: 2.204,
    hotspots: [
      {
        id: "divine-voice",
        character: "The Divine Voice",
        x: 0.65,
        y: 0.4,
        line: "Reach, Adam. The clay is finished. I have placed the architecture of heaven inside your skull. With it comes the power to name the stars, and the curse to know that you will die. Reach... before the light fades.",
      },
      {
        id: "adam",
        character: "Adam",
        x: 0.13,
        y: 0.595,
        line: "I was dirt a moment ago. Cold clay, numb and unthinking. Now there is a fire crawling through my veins, and this strange, heavy burden inside my head. His finger hasn't even touched mine, and already I can think... already I can doubt. Why give me the mind of a god if my body belongs to the dust?",
      },
    ],
    techniques: [
      { id: "brain", name: "The brain silhouette", hint: "Look at the shape of the red cloak that carries God and the angels.", x: 0.85, y: 0.13, w: 0.1, h: 0.14, note: "The red mantle around God, the angels and the trailing scarf traces a cross-section of the human brain, down to the frontal lobe, the pituitary gland and the vertebral artery.", outline: [[[0.484,0.393],[0.509,0.297],[0.541,0.19],[0.584,0.119],[0.638,0.071],[0.703,0.042],[0.773,0.03],[0.838,0.036],[0.892,0.048],[0.935,0.071],[0.978,0.107],[0.995,0.178],[0.992,0.309],[0.978,0.428],[0.962,0.5],[0.978,0.595],[0.946,0.666],[0.892,0.69],[0.838,0.7],[0.784,0.726],[0.73,0.75],[0.676,0.761],[0.622,0.738],[0.579,0.69],[0.541,0.619],[0.509,0.535],[0.49,0.464],[0.484,0.393]], [[0.692,0.761],[0.718,0.83],[0.741,0.892],[0.784,0.928]]] },
      { id: "void", name: "The unbridged void", hint: "Follow the two outstretched arms to the gap between their fingers.", x: 0.355, y: 0.41, w: 0.07, h: 0.11, note: "Adam's wrist rests heavily on his knee, his finger limp and passive. God's finger is tensed, straining across the final millimetre." },
    ],
  },
  {
    slug: "rembrandt-night-watch",
    period: "baroque",
    artist: "Rembrandt van Rijn",
    known: "Rembrandt",
    artistLife: "Dutch, 1606–1669",
    artistNote:
      "The great storyteller of the Dutch Golden Age, Rembrandt painted light the way others painted objects. He made a fortune from portraits of Amsterdam's merchants, then lost it, and painted himself unflinchingly as he aged.",
    artistBlurb: "The master of light and shadow, who painted Amsterdam's merchants, then himself, unflinchingly.",
    portrait: "/artists/rembrandt.webp",
    title: "The Night Watch",
    year: "1642",
    medium: "Oil on canvas",
    location: "Rijksmuseum, Amsterdam",
    about:
      "Captain Frans Banninck Cocq orders his civic militia company to march. Instead of a neat row of paying sitters, Rembrandt painted a crowd in motion: drums, pikes, muskets and a stray dog, all spilling out of the dark.",
    hook: "A pompous civic militia parading into theatrical light, teetering between farce and an accidental gunshot.",
    dilemma:
      "Is Rembrandt honouring the heroic defenders of Dutch liberty, or quietly mocking wealthy merchants playing soldier in the dark with misfiring guns?",
    soundtrack: { piece: "Antonio Vivaldi, Concerto Grosso in D minor, Op. 3 No. 11", players: "Orchestra of the Vienna State Opera" },
    ratio: 1.194,
    hotspots: [
      {
        id: "cocq",
        character: "Captain Frans Banninck Cocq",
        x: 0.47,
        y: 0.645,
        line: "Keep rank, gentlemen! Hold your pikes high! Do not let them see that we are merchants and lawyers dressed in velvet. Hey! Who fired that weapon behind my shoulder?! Silence that drum! We paid Rembrandt for a glorious portrait of civic order, and he has turned our militia into a riot!",
      },
      {
        id: "golden-girl",
        character: "The Golden Girl",
        x: 0.315,
        y: 0.665,
        line: "March, little men, march. Carry your pikes and beat your drums. The dead chicken hangs from my belt, and the gunpowder burns your eyes. You think you rule the city, but you are just shadows dancing across Rembrandt's golden wall.",
      },
    ],
    techniques: [
      { id: "misfire", name: "The misfire", hint: "Look just behind the captain's shoulder, between him and the lieutenant in gold.", x: 0.49, y: 0.47, w: 0.13, h: 0.12, note: "Right behind the captain, a musketeer fires into the crowd. The muzzle flash and smoke bloom inches from the lieutenant's hat." },
      { id: "mascot", name: "The mascot", hint: "Find the small glowing girl in gold, left of the captain. What hangs from her belt?", x: 0.26, y: 0.57, w: 0.11, h: 0.24, note: "A glowing girl runs through the crowd with a dead chicken tied to her belt. Its claws, clauwen, are a pun on the guild's name: the Kloveniers." },
    ],
  },
  {
    slug: "vermeer-pearl-earring",
    period: "baroque",
    artist: "Johannes Vermeer",
    known: "Vermeer",
    artistLife: "Dutch, 1632–1675",
    artistNote:
      "Vermeer worked slowly in Delft, finishing perhaps two paintings a year and leaving fewer than forty. He died in debt and was nearly forgotten for two centuries. No certain portrait of him survives.",
    artistBlurb: "A slow, quiet painter of Delft interiors, who left fewer than forty pictures and died in debt.",
    portrait: "/artists/vermeer.webp",
    portraitNote: "No authenticated portrait of Vermeer survives; the one shown is a likeness often circulated as his.",
    title: "Girl with a Pearl Earring",
    year: "c. 1665",
    medium: "Oil on canvas",
    location: "Mauritshuis, The Hague",
    about:
      "Not a portrait but a tronie, a study of a face. A girl in a blue and yellow turban turns over her shoulder against a dark void, lips parted, as if you just said her name.",
    hook: "An interrupted glance across a dark void: a secret invitation, or a startled servant girl?",
    dilemma: "Are you a welcome lover she turns toward with quiet affection, or did you just break into a servant girl's only private moment?",
    soundtrack: { piece: "Johann Sebastian Bach, Cello Suite No. 1: Prélude", players: "Philip Milman · classicals.de, CC BY 3.0" },
    ratio: 0.844,
    hotspots: [
      {
        id: "girl",
        character: "The Girl",
        x: 0.6,
        y: 0.79,
        line: "Don't move. If you step any closer, the master will notice. This earring is heavy, cold, and fake, borrowed from his wife's jewelry box while she was away. He told me to turn around just like this. Just for a second. Tell me: who are you looking at? The pearl... or me?",
      },
      {
        id: "vermeer",
        character: "Johannes Vermeer",
        dry: true,
        x: 0.625,
        y: 0.54,
        line: "Hold that angle. Do not blink. Let the grey light from the window strike the moist edge of your lower lip. You think this moment belongs to you? In three hundred years, nobody will know your name, your grief, or your secrets. They will only see my light falling across your shadow.",
      },
    ],
    techniques: [
      { id: "pearl", name: "The illusion of the pearl", hint: "Look closely at the earring. How is it hanging from her ear?", x: 0.59, y: 0.5, w: 0.08, h: 0.08, note: "The earring has no hook through the lobe. It is two floating daubs of lead white. At this size it is varnished tin or glass, not an impossibly rare pearl." },
      { id: "lip", name: "The glistening lip", hint: "Look at the corner of her lower lip.", x: 0.36, y: 0.5, w: 0.07, h: 0.06, note: "A pinprick of pure white sits at the corner of her lower lip, making it look moist, her mouth caught mid-breath." },
    ],
  },
  {
    slug: "goya-saturn",
    period: "romanticism",
    artist: "Francisco Goya",
    known: "Goya",
    artistLife: "Spanish, 1746–1828",
    artistNote:
      "First painter to the Spanish court, then, deaf and disillusioned, a recluse who covered the walls of his farmhouse with nightmares. Saturn was painted straight onto his dining-room wall, never meant to be seen.",
    artistBlurb: "Court painter turned deaf recluse, who covered the walls of his farmhouse with nightmares.",
    portrait: "/artists/goya.webp",
    title: "Saturn Devouring His Son",
    year: "c. 1819–1823",
    medium: "Oil mural, transferred to canvas",
    location: "Museo del Prado, Madrid",
    about:
      "Warned that one of his children would overthrow him, the Titan Saturn devoured them. Goya paints him not as a god but as a terrified old man, on the wall of the room where he ate.",
    hook: "A titan eating his child, stripped of crown and throne into a feral, desperate beast crouching in the dark.",
    dilemma:
      "Is Saturn an evil tyrant clinging to power, or a pathetic captive of time, devouring his own creation in primal panic over his own obsolescence?",
    soundtrack: { piece: "Ludwig van Beethoven, String Quartet No. 14, Op. 131", players: "Budapest String Quartet" },
    ratio: 0.544,
    hotspots: [
      {
        id: "saturn",
        character: "Saturn",
        x: 0.66,
        y: 0.35,
        line: "I had to. You don't understand the terror of a throne that rots from beneath you! Every tooth sinking into this flesh is another day I stay alive! They are coming for me, my own bloodline, waiting for my knees to give out! I can taste my own flesh on my tongue! Time eats everything... so why shouldn't I?!",
      },
      {
        id: "slain-son",
        character: "The Slain Son",
        x: 0.55,
        y: 0.48,
        line: "Tear the flesh, father. Grind the bone. It changes nothing. The prophecy does not die in your teeth; it only waits. You stripped your own crown, you crouched in the dirt like a beast, and when the end comes, heaven will not remember a king. They will only remember a coward who ate his tomorrow to survive today.",
      },
    ],
    techniques: [
      { id: "eyes", name: "The eyes of terror", hint: "Look Saturn in the eyes. Is that rage?", x: 0.28, y: 0.14, w: 0.18, h: 0.08, note: "Saturn's wide, bloodshot eyes show panic and dread, not anger or malice." },
      { id: "body", name: "The devoured torso", hint: "Look at the body in his hands. Is it really a child?", x: 0.42, y: 0.26, w: 0.26, h: 0.44, note: "Not a newborn: Goya painted a grown, muscular body, its head and an arm already gone, Saturn's fingers gouged into the bloody back." },
    ],
  },
  {
    slug: "delacroix-liberty",
    period: "romanticism",
    artist: "Eugène Delacroix",
    known: "Delacroix",
    artistLife: "French, 1798–1863",
    artistNote:
      "The leader of French Romanticism, Delacroix favoured colour and movement over the cool line of the classical academy. He did not fight in the July Revolution of 1830, but wrote that he would at least paint for his country.",
    artistBlurb: "The leader of French Romanticism, who chose colour, movement and passion over cool, classical line.",
    portrait: "/artists/delacroix.webp",
    title: "Liberty Leading the People",
    year: "1830",
    medium: "Oil on canvas",
    location: "Musée du Louvre, Paris",
    about:
      "Three days in July 1830 toppled King Charles X. Delacroix paints Liberty as a bare-breasted woman of the people, tricolour raised, climbing a barricade of rubble and bodies with a crowd of workers, students and a street boy behind her.",
    hook: "Revolutionary glory, raised over the stripped corpses of working men on the cobblestones.",
    dilemma:
      "Does Liberty bring emancipation and justice, or is she an indifferent, immortal goddess using the corpses of poor boys as stepping stones for a new ruling class?",
    soundtrack: { piece: "Ludwig van Beethoven, Symphony No. 5: Allegro con brio", players: "Ernest Ansermet, Orchestre de la Suisse Romande" },
    ratio: 1.246,
    hotspots: [
      {
        id: "marianne",
        character: "Marianne (Liberty)",
        x: 0.575,
        y: 0.36,
        line: "Do not look down at the dead. Look forward! Liberty does not bow to kings, nor does she weep for blood spilled in her name. Over the cobblestones! Over the barricades! Today, Paris breaks its chains, and you will march with me or be forgotten by history!",
      },
      {
        id: "gavroche",
        character: "Gavroche (The Street Urchin)",
        x: 0.735,
        y: 0.465,
        line: "Clear the streets! Make way for the tricolor! My brother died on the barricade this morning, and I took his pistols off his belt! They took our bread, they took our votes, but they can't take our fury! Vive la République! Don't look at the dead men's boots. Charge!",
      },
    ],
    techniques: [
      { id: "stripped", name: "The stripped insurgent", hint: "Look down, into the lower left corner, at the dead.", x: 0.2, y: 0.78, w: 0.16, h: 0.14, note: "Lower left, a dead rebel lies stripped of trousers and boots by looters: the poverty of the uprising, laid at your feet." },
      { id: "cap", name: "The cap and the pistols", hint: "Look at what Liberty wears on her head.", x: 0.57, y: 0.08, w: 0.11, h: 0.09, note: "Liberty wears the Phrygian cap of freed Roman slaves. The boy beside her waves cavalry pistols too big for his hands, taken from fallen soldiers." },
    ],
  },
  {
    slug: "vangogh-starry-night",
    period: "expressionism",
    artist: "Vincent van Gogh",
    known: "Van Gogh",
    artistLife: "Dutch, 1853–1890",
    artistNote:
      "Van Gogh painted for barely a decade and sold almost nothing. He painted The Starry Night from memory, in daylight, while a voluntary patient at the asylum of Saint-Rémy, after watching the sky from his barred window.",
    artistBlurb: "He painted for barely ten years and sold almost nothing; now he is the world's most loved painter.",
    portrait: "/artists/vangogh.webp",
    title: "The Starry Night",
    year: "1889",
    medium: "Oil on canvas",
    location: "Museum of Modern Art, New York",
    about:
      "Above a quiet village the sky churns with spirals of wind, an eleven-starred night and a blazing crescent moon. A cypress rises like a dark flame in the foreground. The village and its steeple were partly invented.",
    hook: "A visionary, feverish look at the cosmos, painted from behind the iron bars of an asylum window.",
    dilemma:
      "Was Van Gogh finding ecstatic peace in the cosmic dance of the universe, or was he an abandoned soul watching the stars from a dead earth?",
    soundtrack: { piece: "Claude Debussy, Nocturnes: Nuages", players: "Jun Märkl, Orchestre National de Lyon" },
    ratio: 1.263,
    hotspots: [
      {
        id: "vincent",
        character: "Vincent van Gogh",
        x: 0.66,
        y: 0.86,
        line: "The night is so much more alive than the day. From behind these window bars, I see the sky spinning like an ocean of fire. Look at the village below, all those little families sleeping behind warm windows. But look at the steeple... not a single candle inside. When I look at the stars, I don't feel crazy; I just wonder why we cannot reach them until we are dead.",
      },
      {
        id: "cypress",
        character: "The Cypress Tree",
        x: 0.22,
        y: 0.62,
        line: "I root in the graveyard while my branches claw at the swirling stars. Vincent paints me black because I am the boundary. Between the quiet cottages below and the boiling gold above, I stand as the only bridge mortals cross.",
      },
    ],
    techniques: [
      { id: "church", name: "The dark church", hint: "Count the lit windows in the village. Then find the church.", x: 0.54, y: 0.64, w: 0.06, h: 0.24, note: "Every cottage in the village shows a glowing yellow window. The tall church at the centre is completely dark. Not a single candle burns inside." },
      { id: "cypress", name: "The cemetery cypress", hint: "Look at the dark flame of a tree on the left. What tree is it?", x: 0.13, y: 0.06, w: 0.17, h: 0.92, note: "The huge dark cypress in the foreground is the traditional Mediterranean tree of cemeteries and mourning." },
    ],
  },
  {
    slug: "munch-scream",
    period: "expressionism",
    artist: "Edvard Munch",
    known: "Munch",
    artistLife: "Norwegian, 1863–1944",
    artistNote:
      "Munch lost his mother and his sister to tuberculosis as a child and painted sickness, love, jealousy and dread for the rest of his life. He called his series of these paintings The Frieze of Life.",
    artistBlurb: "A Norwegian painter of love, sickness and dread, who turned private anguish into modern icons.",
    portrait: "/artists/munch.webp",
    title: "The Scream",
    year: "1893",
    medium: "Oil, tempera and pastel on cardboard",
    location: "National Museum, Oslo",
    about:
      "Munch wrote that he was walking with two friends at sunset when the sky turned blood red, and he felt an infinite scream passing through nature. The figure on the bridge is not screaming. It is covering its ears.",
    hook: "Not a figure screaming, but a terrified soul clamping its ears against an invisible, deafening scream passing through nature.",
    dilemma:
      "Is the figure having a private breakdown, or are they the only one perceptive enough to hear the agony of existence while everyone else walks on?",
    soundtrack: { piece: "Gustav Mahler, Symphony No. 5: Trauermarsch", players: "Erich Leinsdorf, Boston Symphony Orchestra" },
    ratio: 0.806,
    hotspots: [
      {
        id: "clamping-soul",
        character: "The Agonized Figure",
        x: 0.5,
        y: 0.71,
        line: "Stop it... please, make it stop! The sun went down and the clouds suddenly turned to boiling blood! Can't you hear it?! It isn't coming from my throat. It's passing through the hills, through the fjord, screaming like a wounded animal! My friends keep walking... they hear nothing. Why am I the only one who can hear the world tearing itself apart?!",
      },
      {
        id: "walking-friend",
        character: "The Passing Friend",
        x: 0.088,
        y: 0.45,
        line: "Come along, Edvard. The sun has set, the evening chill is setting in, and dinner is waiting in town. Why do you always stop at the railing? There is nothing in the sky... nothing at all.",
      },
    ],
    techniques: [
      { id: "skull", name: "The skull-like face", hint: "Look closely at the screaming face. Is it a living person?", x: 0.43, y: 0.47, w: 0.13, h: 0.15, note: "Not a portrait: a bald, sexless skull with hollow eyes and flattened nostrils. Munch is thought to have drawn it from a Peruvian mummy displayed in Paris in 1889." },
      { id: "walkers", name: "The indifferent walkers", hint: "Look far down the railing, behind the figure.", x: 0.0, y: 0.33, w: 0.13, h: 0.22, note: "Behind the figure, two acquaintances in top hats stroll calmly along the railing, deaf to the terror at the front of the picture." },
    ],
  },
];
