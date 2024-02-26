import { Handler, schoology } from "./../../../server"

export const handler: Handler = async (server, socket) => {
    const { key, secret } = await schoology
        .request("GET", "/oauth/request_token")
        .then(schoology.format)
    socket.emit("request", key)
}