const { Magic } = require("@magic-sdk/admin");
require("dotenv").config();

const magicLinkPrivateKey = process.env["MAGIC_LINK_SECRET_KEY"];
const mAdmin = new Magic(magicLinkPrivateKey);

module.exports = {
    validateUser: async (DIDToken) => {
    try {
        const metadata = await mAdmin.users.getMetadataByToken(DIDToken);
        mAdmin.token.validate(DIDToken);
        return { metadata, error: null };
    } catch (error) {
        console.error(error);
        return { metadata: null, error };
    }
}

}
