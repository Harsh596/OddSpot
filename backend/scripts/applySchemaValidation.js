// backend/scripts/applySchemaValidation.js
// Applies MongoDB native $jsonSchema validation via collMod as a second defense line behind Mongoose.

const path = require('path');
const { connect, mongoose } = require('../db');

const SCHEMAS = {
  users: {
    bsonType: 'object',
    required: ['username', 'email', 'role'],
    properties: {
      username: {
        bsonType: 'string',
        maxLength: 24,
        description: 'username must be a string <= 24 chars',
      },
      email: {
        bsonType: 'string',
        description: 'email must be a string',
      },
      role: {
        enum: ['member', 'moderator', 'admin'],
        description: 'role must be member, moderator, or admin',
      },
    },
  },
  posts: {
    bsonType: 'object',
    required: ['title', 'location', 'feedLocation', 'tier'],
    properties: {
      title: {
        bsonType: 'string',
        maxLength: 140,
        description: 'title must be a string <= 140 chars',
      },
      location: {
        bsonType: 'object',
        required: ['coordinates'],
        properties: {
          coordinates: {
            bsonType: 'array',
            minItems: 2,
            maxItems: 2,
            items: {
              bsonType: ['double', 'int', 'long', 'decimal'],
            },
          },
        },
      },
      feedLocation: {
        bsonType: 'object',
        required: ['coordinates'],
        properties: {
          coordinates: {
            bsonType: 'array',
            minItems: 2,
            maxItems: 2,
            items: {
              bsonType: ['double', 'int', 'long', 'decimal'],
            },
          },
        },
      },
      tier: {
        enum: ['city', 'state', 'country'],
        description: 'tier must be city, state, or country',
      },
    },
  },
  votes: {
    bsonType: 'object',
    required: ['userId', 'postId', 'value'],
    properties: {
      userId: {
        bsonType: ['objectId', 'string'],
        description: 'userId must be an ObjectId or string',
      },
      postId: {
        bsonType: ['objectId', 'string'],
        description: 'postId must be an ObjectId or string',
      },
      value: {
        enum: [1, -1],
        description: 'value must be 1 or -1',
      },
    },
  },
  comments: {
    bsonType: 'object',
    required: ['postId', 'body'],
    properties: {
      postId: {
        bsonType: ['objectId', 'string'],
        description: 'postId must be an ObjectId or string',
      },
      body: {
        bsonType: 'string',
        maxLength: 5000,
        description: 'body must be a string <= 5000 chars',
      },
    },
  },
  reports: {
    bsonType: 'object',
    required: ['targetType', 'targetId', 'reporterId', 'reason'],
    properties: {
      targetType: {
        enum: ['post', 'comment'],
        description: 'targetType must be post or comment',
      },
      targetId: {
        bsonType: ['objectId', 'string'],
        description: 'targetId must be an ObjectId or string',
      },
      reporterId: {
        bsonType: ['objectId', 'string'],
        description: 'reporterId must be an ObjectId or string',
      },
      reason: {
        bsonType: 'string',
        description: 'reason must be a string',
      },
    },
  },
};

async function applyCollectionValidators(db) {
  if (!db) {
    throw new Error('applyCollectionValidators requires a valid MongoDB db instance');
  }

  const collections = await db.listCollections().toArray();
  const existingNames = new Set(collections.map((c) => c.name));
  const results = {};

  for (const [collectionName, schema] of Object.entries(SCHEMAS)) {
    if (!existingNames.has(collectionName)) {
      await db.createCollection(collectionName, {
        validator: { $jsonSchema: schema },
        validationLevel: 'moderate',
        validationAction: 'error',
      });
      console.log(`Created collection '${collectionName}' with $jsonSchema validation.`);
      results[collectionName] = 'created';
    } else {
      await db.command({
        collMod: collectionName,
        validator: { $jsonSchema: schema },
        validationLevel: 'moderate',
        validationAction: 'error',
      });
      console.log(`Applied $jsonSchema validation to '${collectionName}' via collMod.`);
      results[collectionName] = 'updated';
    }
  }

  return results;
}

async function main() {
  await connect();
  const db = mongoose.connection.db;
  console.log(`Applying $jsonSchema validation rules on db: ${db.databaseName}...`);
  await applyCollectionValidators(db);
  console.log('All $jsonSchema collection validations applied successfully.');
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to apply schema validations:', err);
    process.exit(1);
  });
}

module.exports = {
  applyCollectionValidators,
  SCHEMAS,
};
