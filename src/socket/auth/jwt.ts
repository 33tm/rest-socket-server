import { Handler, schoology, tokens } from "server"
import { sign } from "jsonwebtoken"

export const handler: Handler = async (server, socket, data) => {
    socket.emit("status", "Loading...")
    const { id } = socket
    if (!tokens.has(id)) return socket.disconnect()
    const { key, secret } = tokens.get(id)!
    if (key !== data) return socket.disconnect()
    const token = await schoology
        .request("GET", "/oauth/access_token", { key, secret })
        .then(schoology.format)
        .catch(() => ({ key: null, secret: null }))
    if (!token.key) return socket.disconnect()
    socket.emit("status", "Fetching user...")
    const { api_uid: uid } = await schoology
        .request("GET", "/app-user-info", token)
        .catch(() => ({ uid: null }))
    if (!uid) return socket.disconnect()
    socket.emit("status", `Verifying UID ${uid}...`)
    const { name_display: name, building_id: bid } = await schoology
        .request("GET", `/users/${uid}`, token)
        .catch(() => ({ name_display: null, building_id: null }))
    if (bid !== 7924989) return socket.emit("error")
    socket.emit("status", `Authenticating as ${name}...`)
    const jwt = sign({ uid }, process.env.JWT_SECRET!, { expiresIn: "2d" })
    socket.emit("jwt", jwt)
}