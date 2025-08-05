import React, { useState, createContext, useContext } from 'react'

const PlatformContext = createContext({
  platform: 'twitter',
  setPlatform: () => {},
})

export const usePlatform = () => useContext(PlatformContext)

export const PlatformProvider = ({ children }) => {
  const [platform, setPlatform] = useState('twitter')

  return (
    <PlatformContext.Provider value={{ platform, setPlatform }}>
      {children}
    </PlatformContext.Provider>
  )
}
