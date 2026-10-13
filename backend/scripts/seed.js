// Optional: a tiny bit of dev data so feeds aren't empty.
const { connect, mongoose } = require('../db');
const { User, Post, Community, Membership } = require('../models');

(async () => {
  await connect();
  const user = await User.findOneAndUpdate(
    { username: 'demo' },
    { username: 'demo', email: 'demo@example.com', passwordHash: 'not-a-real-hash' },
    { upsert: true, new: true }
  );
  const community = await Community.findOneAndUpdate(
    { slug: 'bengaluru-odd' },
    {
      name: 'Bengaluru Odd', slug: 'bengaluru-odd', scope: 'city',
      place: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
      createdBy: user._id,
    },
    { upsert: true, new: true }
  );
  await Membership.updateOne(
    { userId: user._id, communityId: community._id },
    { $setOnInsert: { role: 'owner' } },
    { upsert: true }
  );
  await Post.create({
    authorId: user._id, communityId: community._id,
    title: 'Seeded test post',
    location: { type: 'Point', coordinates: [77.5946, 12.9716] },
    place: { city: 'Bengaluru', state: 'Karnataka', country: 'India' },
    tags: ['test'],
  });
  console.log('Seeded.');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
