import { Handler, schoology, tokens } from "server"
import { verify } from "jsonwebtoken"

export const handler: Handler = async (server, socket) => {
    try {
        const { token } = socket.handshake.auth
        verify(token, process.env.JWT_SECRET!)
        socket.emit("auth")
    } catch {
        const { id } = socket
        const { key, secret } = tokens.get(id)! || await schoology
            .request("GET", "/oauth/request_token")
            .then(schoology.format)
            .catch(() => ({ key: null, secret: null }))
        if (!key) return socket.disconnect()
        tokens.has(id) || tokens.set(id, { key, secret })
        socket.join(key)
        socket.emit("token", key)
    }
}