import { Handler, schoology, tokens } from "server"

export const handler: Handler = async (server, socket) => {
    const { id } = socket
    const { key, secret } = tokens.get(id)! || await schoology
        .request("GET", "/oauth/request_token")
        .then(schoology.format)
        .catch(() => socket.disconnect())
    if (!tokens.has(id) && key) tokens.set(id, { key, secret })
    socket.emit("request", key)
}