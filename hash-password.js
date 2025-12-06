/* eslint-disable @typescript-eslint/no-require-imports */
const bcrypt = require("bcryptjs")

const password = "nicoenergym"

bcrypt.hash(password, 10).then((hash) => {
  console.log("HASH GENERADO:")
  console.log(hash)
})
