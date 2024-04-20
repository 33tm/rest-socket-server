import express, { Request, Response, json } from "express"
import { Namespace, Server, Socket } from "socket.io"
import cors from "cors"

import { dirname } from "path"
import { readdirSync, statSync } from "fs"
import { createServer } from "http"

import SchoologyAPI from "schoologyapi"
import { verify } from "jsonwebtoken"

export const schoology = new SchoologyAPI(
    process.env.SCHOOLOGY_KEY!,
    process.env.SCHOOLOGY_SECRET!
)

export const tokens = new Map<string, { key: string, secret: string }>()

const config = { origin: ["http://localhost:3000"] }

const rest = express()
const server = createServer(rest)
const io = new Server(server, { cors: config })

rest.use(json(), cors(config))

if (process.env.NODE_ENV === "production") {
    import("@socket.io/cluster-adapter")
        .then(({ createAdapter }) => io.adapter(createAdapter()))
    import("@socket.io/sticky")
        .then(({ setupWorker }) => setupWorker(io))
}

export type Route = (req: Request, res: Response) => void
export type Handler = (server: Namespace, socket: Socket, data: unknown) => void

const importRoutes = (root: string) => {
    readdirSync(root).forEach(file => {
        const path = `${root}/${file}`
        if (statSync(path).isDirectory()) return importRoutes(path)
        if (!file.endsWith(".ts")) return
        import(`./${path.slice(4, -3)}`).then(route => {
            const endpoint = path
                .slice(8, -3)
                .replace(/\[([^[\]]+)\]/g, ":$1")
                .replace(/\/index$/g, "") || "/"
            Object.entries(route).forEach(([method, handler]) => {
                if (!(method.toLowerCase() in rest)) return
                rest[method.toLowerCase() as keyof typeof rest](endpoint, handler)
                console.log(`REST ${method} ${endpoint}`)
            })
        })
    })
}

importRoutes("src/rest")

const events = async (root: string) => {
    readdirSync(root).forEach(file => {
        const path = `${root}/${file}`
        if (statSync(path).isDirectory()) return events(path)
        if (!file.endsWith(".ts")) return
        console.log(file)
        import(`./${path.slice(4, -3)}`).then(({ handler }: { handler: Handler }) => {
            if (!handler) return
            const namespace = io.of(`/${dirname(path).slice(11)}`)
            namespace.on("connection", socket => {
                socket.on(file.slice(0, -3), data => {
                    handler(namespace, socket, data)
                })
            })
            console.log(`Socket ${namespace.name} [${file.slice(0, -3)}]`)
        })
    })
}

events("src/socket")

io.of("/auth").on("connection", socket => {
    socket.on("disconnect", () => {
        tokens.delete(socket.id)
    })
})

io.of("/app").use((socket, next) => {
    const { token } = socket.handshake.auth
    if (!token) next(Error())
    try {
        socket.data = verify(token, process.env.JWT_SECRET!)
        next()
    } catch {
        next(Error())
    }
})

server.listen(443)