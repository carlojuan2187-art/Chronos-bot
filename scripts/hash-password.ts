import argon2 from 'argon2'
const password=process.argv[2];if(!password){console.error('Usage: npm run hash-password -- "YourStrongPassword"');process.exit(1)}console.log(await argon2.hash(password,{type:argon2.argon2id}))
