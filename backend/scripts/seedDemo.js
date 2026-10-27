// backend/scripts/seedDemo.js
// Idempotent demo database seeder for local frontend development and testing.
// SAFETY: Refuses to execute against any database whose name does not end in '_test'.

require('dotenv').config();
const bcrypt = require('bcrypt');
const { connect, disconnect, mongoose, extractDbName } = require('../db');
const {
  User,
  Post,
  Comment,
  Vote,
  Report,
  Notification,
  Visit,
  Community,
  Membership,
} = require('../models');
const { fuzzLocation } = require('../utils/fuzzLocation');
const { toCityKey, resolveCountry } = require('../utils/place');
const { computeScore, calculateHotScore } = require('../services/meter');

const DEMO_PASSWORD = 'DemoPassword123!';

const DEMO_USERS_DATA = [
  {
    username: 'demo_scout',
    email: 'demo_scout@oddspot.local',
    bio: 'Founding field scout exploring strange urban topography.',
    role: 'member',
    badges: ['scout', 'first_visit', '10_visits'],
    homePlace: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
  },
  {
    username: 'demo_explorer',
    email: 'demo_explorer@oddspot.local',
    bio: 'Audio-frequency enthusiast and subterranean corridor mapper.',
    role: 'member',
    badges: ['scout', 'first_visit'],
    homePlace: { city: 'London', state: 'Greater London', country: 'United Kingdom' },
  },
  {
    username: 'demo_ranger',
    email: 'demo_ranger@oddspot.local',
    bio: 'Night wanderer tracking forgotten landmarks and twilight spots.',
    role: 'member',
    badges: ['scout'],
    homePlace: { city: 'Tokyo', state: 'Kanto', country: 'Japan' },
  },
  {
    username: 'demo_curator',
    email: 'demo_curator@oddspot.local',
    bio: 'Archivist of folklore, strange architecture, and lost signage.',
    role: 'member',
    badges: ['scout', 'first_visit'],
    homePlace: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
  },
  {
    username: 'demo_mod',
    email: 'demo_mod@oddspot.local',
    bio: 'Community safety warden and verified location fact-checker.',
    role: 'moderator',
    badges: ['scout', '10_visits'],
    homePlace: { city: 'London', state: 'Greater London', country: 'United Kingdom' },
  },
  {
    username: 'demo_admin',
    email: 'demo_admin@oddspot.local',
    bio: 'System overseer for the OddSpot field intelligence network.',
    role: 'admin',
    badges: ['scout', 'first_visit', '10_visits'],
    homePlace: { city: 'Tokyo', state: 'Kanto', country: 'Japan' },
  },
];

const DEMO_COMMUNITIES_DATA = [
  {
    name: 'demo_ Bengaluru Oddities',
    slug: 'demo-blr-anomalies',
    description: 'Bespoke anomalies, historic banyans, and hidden passages in Bengaluru.',
    scope: 'city',
    place: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
    center: { type: 'Point', coordinates: [77.5946, 12.9716] },
    rules: ['Respect historical sites', 'Verify GPS on-site', 'No littering'],
    flairs: ['folklore', 'banyan', 'acoustic', 'secret-tunnel'],
  },
  {
    name: 'demo_ London Curiosities',
    slug: 'demo-london-curiosities',
    description: 'Subterranean rivers, forgotten memorial parks, and Victorian oddities.',
    scope: 'city',
    place: { city: 'London', state: 'Greater London', country: 'United Kingdom' },
    center: { type: 'Point', coordinates: [-0.1278, 51.5074] },
    rules: ['Mind private mews', 'Take clear daylight photos', 'Report locked gates'],
    flairs: ['subterranean', 'victorian', 'memorial', 'cryptic'],
  },
  {
    name: 'demo_ Tokyo Micro-Wonders',
    slug: 'demo-tokyo-oddities',
    description: 'Miniature shrines, rooftop staircases to nowhere, and alley secrets.',
    scope: 'city',
    place: { city: 'Tokyo', state: 'Kanto', country: 'Japan' },
    center: { type: 'Point', coordinates: [139.6917, 35.6895] },
    rules: ['Quiet in residential shotengai', 'No flash at night', 'Honor local shrines'],
    flairs: ['shrine', 'alleyway', 'staircase', 'retro-future'],
  },
];

// Sample HTTPS image URLs from Unsplash CDN that strictly satisfy image allowlist / SSRF rules
const DEMO_IMAGES = [
  'https://images.unsplash.com/photo-1514565131-fce0801e5785',
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb',
  'https://images.unsplash.com/photo-1519501025264-65ba15a82390',
  'https://images.unsplash.com/photo-1477959858617-67f30bc75b82',
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab',
  'https://images.unsplash.com/photo-1449824913935-59a10b8d2000',
];

function generatePostsConfig(users, communities) {
  const posts = [];
  const cityConfigs = [
    {
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      countryCode: 'IN',
      centerLng: 77.5946,
      centerLat: 12.9716,
      comm: communities[0],
      titles: [
        'demo_ The Whispering Banyan of Malleshwaram',
        'demo_ Abandoned Colonial Tramway Stanchion',
        'demo_ Echo Chamber Well behind Basavanagudi Temple',
        'demo_ The Hidden Granite Maze of Gavipuram',
        'demo_ Ghost Water Tower near Old Madras Road',
        'demo_ Cryptic Clock Tower with Counter-Clockwise Hands',
        'demo_ The Lost Stepwell of Begur Fort',
        'demo_ Iron Girders Embedded in Peepal Tree',
        'demo_ Underground Cistern under Central Library',
        'demo_ Subterranean Acoustic Chamber of Lalbagh', // Country Tier post
        'demo_ Abandoned Quarry Lake Anomaly',
        'demo_ Mystery Sundial with Inverted Gnomon',
        'demo_ Identify Mysterious Brass Symbol on Church Street Stone', // Identify post
        'demo_ Forgotten Rail Spur in Cottonpet Alley',
        'demo_ Hidden Rooftop Terrace with Miniature Temple',
        'demo_ The Resonating Archway of Ulsoor',
        'demo_ Steam Locomotive Turntable Overgrown by Vines',
        'demo_ Spiral Staircase Leading into Dry Canal',
        'demo_ Victorian Postbox Swallowed by Ficus Roots',
        'demo_ Sealed Masonry Portal in Bangalore Palace Outer Wall',
      ],
    },
    {
      city: 'London',
      state: 'Greater London',
      country: 'United Kingdom',
      countryCode: 'GB',
      centerLng: -0.1278,
      centerLat: 51.5074,
      comm: communities[1],
      titles: [
        'demo_ Postmans Park Ceramic Memorials to Heroic Self-Sacrifice',
        'demo_ The Seven Dials Acoustic Focal Point',
        'demo_ Forgotten Subterranean River Tyburn Inspection Grate',
        'demo_ The Camberwell Submarine Vent Pipe',
        'demo_ Victorian Gas Lamps Burning Sewer Gas',
        'demo_ The Miniature Police Box on Trafalgar Square Flank',
        'demo_ Crystal Palace Dinosaurs Hidden in the Thicket',
        'demo_ St Dunstan in the East Overgrown Nave',
        'demo_ The Narrowest Facade in South Kensington',
        'demo_ Crossbones Graveyard Bronze Ribbons',
        'demo_ The Hidden Roman Wall Section inside Car Park Basement',
        'demo_ Strand Ghost Station Emergency Egress Gate',
        'demo_ Thames Foreshore Tudor Tile Scatter',
        'demo_ The Gherkin Reflection Parabolic Hotspot',
        'demo_ Aldwych Underground Spook Track Portal',
        'demo_ Fake Victorian Houses at 23-24 Leinster Gardens',
        'demo_ Bleeding Heart Yard Cobblestone Marker',
        'demo_ The Whispering Gallery of St Pauls Lower Crypt',
        'demo_ Greenwich Prime Meridian Brass Inlay Alleyway Branch',
        'demo_ Iron Bollard Made from Captured Napoleonic Cannon',
      ],
    },
    {
      city: 'Tokyo',
      state: 'Kanto',
      country: 'Japan',
      countryCode: 'JP',
      centerLng: 139.6917,
      centerLat: 35.6895,
      comm: communities[2],
      titles: [
        'demo_ The Ghost Alley Vending Machine Serving Dashi Stock',
        'demo_ Rooftop Shrine wedged between Shinjuku Skyscrapers',
        'demo_ Miniature Torii Gate Embedded in Concrete Retaining Wall',
        'demo_ The Spiral Fire Escape of Ginza Backstreet',
        'demo_ Silent Acoustic Courtyard under Shibuya Sky',
        'demo_ Overgrown Wooden Ryokan trapped in High-Rise Shadow',
        'demo_ The Monorail Pillar Painted as Ancient Cedar Tree',
        'demo_ Yanaka Cats Cemetery Secret Stone Bas-Relief',
        'demo_ Subterranean Drainage Portal of Kanda River',
        'demo_ Showa-era Phone Booth with Working Rotary Dial',
        'demo_ Underground Arcade with Zero Signage in Akihabara',
        'demo_ Floating Wooden Tea Pavilion in Hidden Canal Arm',
        'demo_ The Inverted Staircase of Roppongi Subway Shaft',
        'demo_ Century-Old Shochu Barrel Wall in Omoide Yokocho',
        'demo_ Concrete Tetrapod Garden behind Warehouse Pier',
        'demo_ Micro-Shrine Dedicated to Lost Umbrella Spirits',
        'demo_ The Red Neon Bridge between Twin Apartment Blocks',
        'demo_ Abandoned Water Mill hidden in Meguro Ravine',
        'demo_ Stone Jizo Statues with Hand-Knitted Red Beanies',
        'demo_ The Echo Chamber Bridge of Sumida River',
      ],
    },
  ];

  let postIdx = 0;
  for (const c of cityConfigs) {
    for (let i = 0; i < c.titles.length; i++) {
      postIdx++;
      const title = c.titles[i];
      const author = users[postIdx % users.length];

      // Displace coordinates realistically around city center (+- 0.03 deg ~ 3km)
      const offsetLng = ((i % 5) - 2) * 0.012 + (Math.sin(i) * 0.005);
      const offsetLat = (Math.floor(i / 5) - 2) * 0.012 + (Math.cos(i) * 0.005);
      const lng = parseFloat((c.centerLng + offsetLng).toFixed(6));
      const lat = parseFloat((c.centerLat + offsetLat).toFixed(6));

      // Specific conditions required by spec:
      const isCountryTier = title.includes('Lalbagh');
      const isIdentify = title.includes('Identify');
      const isHiddenExact = (i % 3 === 0); // ~20 hidden-exact posts across the set

      // Images count: between 1 and 6 HTTPS URLs
      const imgCount = (i % 6) + 1;
      const images = [];
      for (let imgI = 0; imgI < imgCount; imgI++) {
        images.push({
          url: DEMO_IMAGES[imgI % DEMO_IMAGES.length],
          width: 1200,
          height: 800,
        });
      }

      // Fuzz coordinates if hideExact is true
      let feedCoords = [lng, lat];
      if (isHiddenExact) {
        feedCoords = fuzzLocation([lng, lat], title);
      }

      const postObj = {
        authorId: author._id,
        communityId: c.comm._id,
        type: isIdentify ? 'identify' : 'find',
        title,
        body: `### Dispatch Note\n\nExploration log for **${title}**.\n\nDiscovered during reconnaissance in ${c.city}. Notice the architectural oddity and anomalous acoustics on site.\n\n> Note: Please tread carefully and respect the neighborhood context.`,
        images,
        location: { type: 'Point', coordinates: [lng, lat] },
        feedLocation: { type: 'Point', coordinates: feedCoords },
        hideExact: isHiddenExact,
        place: {
          city: c.city,
          cityKey: toCityKey(c.city),
          state: c.state,
          country: c.country,
          countryCode: c.countryCode,
        },
        tags: ['urban-exploration', 'curiosity', isHiddenExact ? 'hidden-gem' : 'landmark'],
        warnings: i % 4 === 0 ? ['walking_required'] : i % 7 === 0 ? ['unsafe_night'] : [],
        tier: isCountryTier ? 'country' : 'city',
        spotStatus: 'still_there',
        solved: isIdentify,
        meter: {
          score: isCountryTier ? 78 : (i * 2 + 5),
          likes: isCountryTier ? 25 : (i + 2),
          dislikes: 0,
          comments: 3,
          commenters: 2,
          visits: isCountryTier ? 6 : (i % 4),
          reactions: isCountryTier ? 5 : 1,
        },
        createdAt: new Date(Date.now() - (60 - postIdx) * 3600000 * 4),
      };

      postObj.hotScore = calculateHotScore(postObj.meter.score, postObj.createdAt);
      posts.push(postObj);
    }
  }

  return posts;
}

async function seedDemo({ quiet = false } = {}) {
  const log = (...args) => {
    if (!quiet) console.log(...args);
  };

  log('=== OddSpot Idempotent Demo Seeder ===');

  // Verify DB safety
  const dbName = (mongoose.connection.name || '').toLowerCase();
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Safety violation: Refusing to seed non-test database "${dbName}". Target database name must end in "_test".`
    );
  }

  log(`Target verified safe test database: "${dbName}"`);

  // 1. Wipe previous demo records idempotently
  log('Clearing existing demo records...');
  const oldDemoUsers = await User.find({ username: /^demo_/ }).select('_id');
  const oldUserIds = oldDemoUsers.map((u) => u._id);
  const oldDemoComms = await Community.find({ slug: /^demo-/ }).select('_id');
  const oldCommIds = oldDemoComms.map((c) => c._id);
  const oldDemoPosts = await Post.find({
    $or: [{ authorId: { $in: oldUserIds } }, { title: /^demo_/ }],
  }).select('_id');
  const oldPostIds = oldDemoPosts.map((p) => p._id);

  await Comment.deleteMany({
    $or: [{ postId: { $in: oldPostIds } }, { authorId: { $in: oldUserIds } }],
  });
  await Vote.deleteMany({
    $or: [{ postId: { $in: oldPostIds } }, { userId: { $in: oldUserIds } }],
  });
  await Visit.deleteMany({
    $or: [{ postId: { $in: oldPostIds } }, { userId: { $in: oldUserIds } }],
  });
  await Report.deleteMany({
    $or: [
      { reporterId: { $in: oldUserIds } },
      { targetId: { $in: [...oldPostIds, ...oldUserIds] } },
    ],
  });
  await Notification.deleteMany({
    $or: [{ userId: { $in: oldUserIds } }, { actorId: { $in: oldUserIds } }],
  });
  await Membership.deleteMany({
    $or: [{ userId: { $in: oldUserIds } }, { communityId: { $in: oldCommIds } }],
  });
  await Post.deleteMany({ _id: { $in: oldPostIds } });
  await Community.deleteMany({ _id: { $in: oldCommIds } });
  await User.deleteMany({ _id: { $in: oldUserIds } });

  log('Prior demo records cleanly purged.');

  // 2. Create 6 demo users
  log('Creating 6 demo users with hashed credentials...');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const createdUsers = [];

  for (const uData of DEMO_USERS_DATA) {
    const user = await User.create({
      ...uData,
      passwordHash,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      stats: { posts: 10, visits: 5 },
    });
    createdUsers.push(user);
    log(`  [User] ${user.username} (${user.role}) -> ${user.email}`);
  }

  // 3. Create 3 demo communities
  log('Creating 3 demo communities across 3 cities...');
  const createdCommunities = [];
  for (let i = 0; i < DEMO_COMMUNITIES_DATA.length; i++) {
    const commData = DEMO_COMMUNITIES_DATA[i];
    const owner = createdUsers[i % createdUsers.length];
    const comm = await Community.create({
      ...commData,
      createdBy: owner._id,
      memberCount: createdUsers.length,
    });
    createdCommunities.push(comm);
    log(`  [Community] ${comm.name} (${comm.slug})`);

    // Create memberships for all demo users in each community
    for (const u of createdUsers) {
      await Membership.create({
        userId: u._id,
        communityId: comm._id,
        role: u._id.equals(owner._id) ? 'owner' : u.role === 'moderator' ? 'moderator' : 'member',
      });
    }
  }

  // 4. Create 60 demo posts spread across 3 cities
  log('Creating 60 demo posts spread across Bengaluru, London, and Tokyo...');
  const rawPosts = generatePostsConfig(createdUsers, createdCommunities);
  const createdPosts = await Post.insertMany(rawPosts);
  log(`  Created ${createdPosts.length} demo posts.`);

  // 5. Create threaded comments
  log('Creating threaded comments...');
  let totalComments = 0;
  for (let i = 0; i < createdPosts.length; i += 2) {
    const post = createdPosts[i];
    const author1 = createdUsers[(i + 1) % createdUsers.length];
    const author2 = createdUsers[(i + 2) % createdUsers.length];

    const rootComment = await Comment.create({
      postId: post._id,
      authorId: author1._id,
      body: `Verified this anomaly on-site yesterday! The acoustic resonance is fascinating around twilight.`,
      createdAt: new Date(Date.now() - 3600000 * 2),
    });
    totalComments++;

    // Threaded reply
    await Comment.create({
      postId: post._id,
      authorId: author2._id,
      parentId: rootComment._id,
      body: `Agreed @${author1.username}, I recorded a 440Hz baseline hum near the base!`,
      createdAt: new Date(Date.now() - 1800000),
    });
    totalComments++;

    // If identify post, mark bestCommentId
    if (post.type === 'identify' && post.solved) {
      await Post.findByIdAndUpdate(post._id, { bestCommentId: rootComment._id });
    }
  }
  log(`  Created ${totalComments} threaded comments.`);

  // 6. Create votes
  log('Creating upvotes and downvotes...');
  let totalVotes = 0;
  for (let i = 0; i < createdPosts.length; i++) {
    const post = createdPosts[i];
    for (let uI = 0; uI < 3; uI++) {
      const voter = createdUsers[uI];
      if (!voter._id.equals(post.authorId)) {
        await Vote.create({
          userId: voter._id,
          postId: post._id,
          value: 1,
        });
        totalVotes++;
      }
    }
  }
  log(`  Created ${totalVotes} votes.`);

  // 7. Create verified visits
  log('Creating verified field visits...');
  let totalVisits = 0;
  for (let i = 0; i < createdPosts.length; i += 3) {
    const post = createdPosts[i];
    const visitor = createdUsers[(i + 3) % createdUsers.length];
    await Visit.create({
      postId: post._id,
      userId: visitor._id,
      location: post.location,
      verified: true,
      spotStatus: 'still_there',
      note: 'Checked in on location. The physical structure remains fully intact.',
      photoUrl: DEMO_IMAGES[i % DEMO_IMAGES.length],
    });
    totalVisits++;
  }
  log(`  Created ${totalVisits} verified visits.`);

  // 8. Create reports
  log('Creating sample moderation reports...');
  const reportedPost = createdPosts[5];
  await Report.create({
    targetType: 'post',
    targetId: reportedPost._id,
    reporterId: createdUsers[0]._id,
    reason: 'unsafe_or_private',
    details: 'Caution needed: walking path near loose gravel on edge.',
    status: 'open',
  });
  log(`  Created 1 sample moderation report.`);

  // 9. Create notifications
  log('Creating user notifications...');
  let totalNotifications = 0;
  for (const u of createdUsers) {
    await Notification.create({
      userId: u._id,
      actorId: createdUsers[0]._id,
      type: 'tier_up',
      data: { message: 'Your field dispatch was promoted to a higher discovery tier!' },
      read: false,
    });
    totalNotifications++;
  }
  log(`  Created ${totalNotifications} notifications.`);

  log('\n=== Demo Seeding Completed Successfully ===\n');
  log('Credentials Summary (Local Test Use Only):');
  log('Password for all demo accounts:', DEMO_PASSWORD);
  for (const u of createdUsers) {
    log(` - ${u.username} (${u.role}): ${u.email}`);
  }

  return {
    usersCount: createdUsers.length,
    communitiesCount: createdCommunities.length,
    postsCount: createdPosts.length,
    commentsCount: totalComments,
    votesCount: totalVotes,
    visitsCount: totalVisits,
    notificationsCount: totalNotifications,
  };
}

if (require.main === module) {
  (async () => {
    try {
      await connect();
      await seedDemo();
      await disconnect();
      process.exit(0);
    } catch (err) {
      console.error('Seed demo failed:', err);
      process.exit(1);
    }
  })();
}

module.exports = { seedDemo, DEMO_PASSWORD };
