import { useState } from "react";
import { UserContext } from "./UserContext"

export const UserProvider = ({ children }) => {

    const [user, setUser] = useState({ name: '', rooms: []});
    const [socket, setSocket] = useState(null);

    return (
        <UserContext.Provider value={{ user, setUser, socket, setSocket }}>
            {children}
        </UserContext.Provider>
    )
}