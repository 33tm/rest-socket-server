import { Handler } from "server"

export const handler: Handler = (server, socket) => {
    console.log(socket.data)
    socket.emit("status", socket.data)
}