import { Handler } from "server"

export const handler: Handler = (server, socket) => {
    const { uid } = socket.data
    server.emit("uid", uid)
}