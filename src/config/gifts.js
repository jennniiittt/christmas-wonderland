/**
 * Mystery Christmas Presents — contents and layout. Edit freely.
 *
 * reveal:   which animated surprise plays when the gift opens
 *           'greeting' | 'letter' | 'snowflake' | 'shootingStar' | 'snowGlobe' | 'grand'
 * style:    wrapping style (see PRESENT_STYLES in interactions/presents.js)
 * angle:    position around the tree in degrees (90 = facing the visitor)
 * radius:   distance from the trunk
 * size:     [width, height, depth]
 * special:  the special gift unlocks after all regular gifts are opened
 */
export const GIFTS = [
  {
    id: 'golden',
    name: 'Golden Present',
    style: 'champagne',
    reveal: 'greeting',
    angle: 67,
    radius: 6.3,
    size: [1.35, 1.08, 1.35],
    kicker: 'The Golden Present',
    title: 'Merry Christmas',
    text: 'May your days be merry and bright, your evenings warm with candlelight, and your heart as full as a stocking on Christmas morning.',
    signature: '— with love, from the Wonderland',
  },
  {
    id: 'red',
    name: 'Ruby Present',
    style: 'ruby',
    reveal: 'letter',
    angle: 115,
    radius: 6.2,
    size: [1.23, 1.42, 1.17],
    kicker: 'The Ruby Present',
    title: 'A secret message',
    sealText: 'For you',
    text:
      'Dear friend,\n\nIn case nobody has told you lately: you matter more than you know. The way you show up, the kindness you give without counting — it has made this year warmer for the people around you.\n\nRest now. You have done enough.',
    signature: 'Yours, always',
  },
  {
    id: 'emerald',
    name: 'Emerald Present',
    style: 'emerald',
    reveal: 'snowflake',
    angle: 44,
    radius: 6.0,
    size: [1.58, 0.83, 1.17],
    kicker: 'The Emerald Present',
    title: 'One of a kind',
    text: 'No two snowflakes have ever been the same — and neither have two people. This one was made only for you.',
  },
  {
    id: 'silver',
    name: 'Silver Present',
    style: 'silver',
    reveal: 'shootingStar',
    angle: 143,
    radius: 6.1,
    size: [1.08, 1.17, 1.08],
    kicker: 'The Silver Present',
    title: 'Quick — make a wish!',
    text: 'A shooting star has been released into the Christmas sky, just for you. Close your eyes. Whatever you wished for is now on its way.',
  },
  {
    id: 'blue',
    name: 'Midnight Present',
    style: 'midnight',
    reveal: 'snowGlobe',
    angle: 18,
    radius: 6.6,
    size: [1.2, 1.2, 1.2],
    kicker: 'The Midnight Present',
    title: 'A tiny world',
    text: 'A miniature snow globe, small enough to hold a whole winter. Shake it — or tap it — and watch the snow swirl.',
  },
  {
    id: 'special',
    name: 'The Special Golden Present',
    style: 'royal',
    reveal: 'grand',
    special: true,
    angle: 90,
    radius: 7.2,
    size: [1.72, 1.58, 1.72],
    kicker: 'The Special Golden Present',
    title: 'You found all the magic',
    text: 'Five gifts, five little wonders — and you opened every one. The sky has noticed: the northern lights have woken up to celebrate you.',
    signature: 'Merry Christmas, from all of us in the Wonderland',
  },
];

export const REGULAR_GIFT_COUNT = GIFTS.filter((g) => !g.special).length;
