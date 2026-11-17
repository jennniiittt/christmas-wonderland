/**
 * Magic ornaments on the tree — edit freely.
 *
 * type:     'wish' | 'message' | 'surprise' | 'gift'
 * height:   0 (lowest branches) … 1 (top of the tree)
 * angle:    position around the tree in radians (Math.PI / 2 faces the visitor)
 * effect:   for 'surprise' — 'spiral' (golden light climbs to the star) or 'snowburst'
 * item:     for 'gift'     — 'cocoa' | 'candle'
 */
const FRONT = Math.PI / 2;

export const ORNAMENTS = [
  {
    type: 'wish',
    height: 0.18,
    angle: FRONT - 0.42,
    kicker: 'A Christmas wish',
    title: 'Warmth for every home',
    text: 'May every window glow tonight, and every heart find its way home to someone who has been waiting for it.',
  },
  {
    type: 'message',
    height: 0.34,
    angle: FRONT + 0.5,
    kicker: 'A hidden message',
    title: 'You were missed',
    text: 'Someone thought of you today and smiled. That is the quiet magic of Christmas — it travels further than we know.',
  },
  {
    type: 'surprise',
    effect: 'spiral',
    height: 0.52,
    angle: FRONT - 0.18,
    kicker: 'A little surprise',
    title: 'Light, climbing',
    text: 'Every kind word you have spoken this year has been saved up as starlight. Watch it climb to the very top.',
  },
  {
    type: 'gift',
    item: 'cocoa',
    height: 0.27,
    angle: FRONT + 1.15,
    kicker: 'A small gift',
    title: 'One cup of hot cocoa',
    text: 'Redeemable on any cold evening. Marshmallows included. Best enjoyed slowly, by a window, watching the snow.',
  },
  {
    type: 'wish',
    height: 0.62,
    angle: FRONT + 0.75,
    kicker: 'A Christmas wish',
    title: 'Gentle days ahead',
    text: 'May the new year bring you soft mornings, brave beginnings, and more laughter than you can count.',
  },
  {
    type: 'message',
    height: 0.44,
    angle: FRONT - 1.05,
    kicker: 'A hidden message',
    title: 'Look up tonight',
    text: 'The same stars shine over everyone you love. Somewhere, someone is looking at them and thinking of you.',
  },
  {
    type: 'surprise',
    effect: 'snowburst',
    height: 0.1,
    angle: FRONT + 0.15,
    kicker: 'A little surprise',
    title: 'A flurry of wonder',
    text: 'Make the snow dance. Some joys are best when they come all at once.',
  },
  {
    type: 'gift',
    item: 'candle',
    height: 0.72,
    angle: FRONT - 0.65,
    kicker: 'A small gift',
    title: 'A candle for the window',
    text: 'An old tradition: a candle in the window so any traveller knows they are welcome. This one is yours to keep lit.',
  },
];
