import React, { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart2Icon,
  CalendarIcon,
  BrainIcon,
  HomeIcon,
  TwitterIcon,
  InstagramIcon,
  FacebookIcon,
  KeyIcon,
  LogOutIcon,
  MenuIcon,
  XIcon,
} from 'lucide-react'
import { usePlatform } from '../context/PlatformContext'
import { useAuth } from '../context/AuthContext'

const Sidebar = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const { platform, setPlatform } = usePlatform()
  const { logout, user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768) 
      if (window.innerWidth >= 768) {
        setIsOpen(false) 
      }
    }

    checkScreenSize()
    window.addEventListener('resize', checkScreenSize)
    return () => window.removeEventListener('resize', checkScreenSize)
  }, [])

  
  useEffect(() => {
    if (isMobile) {
      setIsOpen(false)
    }
  }, [location.pathname, isMobile])

  const isActive = (path) => location.pathname === path

  const handleLogout = () => {
    logout()
    navigate('/login') 
  }

  const toggleSidebar = () => {
    setIsOpen(!isOpen)
  }

  const closeSidebar = () => {
    if (isMobile) {
      setIsOpen(false)
    }
  }

  const HamburgerButton = () => (
    <button
      onClick={toggleSidebar}
      className="md:hidden fixed top-4 left-4 z-50 p-2 bg-white border border-gray-200 rounded-lg shadow-lg hover:bg-gray-50 transition-colors"
      aria-label="Toggle menu"
    >
      {isOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
    </button>
  )

  const Overlay = () => (
    <>
      {isMobile && isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={closeSidebar}
        />
      )}
    </>
  )

  const sidebarContent = (
    <div className="h-full p-4 flex flex-col">
      {/* Header */}
      <div className="mb-8 pt-12 md:pt-0">
        <h1 className="text-xl font-bold text-gray-800">SocialGrow AI</h1>
        <p className="text-sm text-gray-500">Powered by Gemini</p>
      </div>

      {/* Platform Selection */}
      <div className="mb-8">
        <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
          Platforms
        </h2>
        <div className="flex space-x-2">
          <button
            onClick={() => {
              setPlatform('twitter')
              closeSidebar()
            }}
            className={`p-2 rounded-full transition-colors ${
              platform === 'twitter'
                ? 'bg-blue-100 text-blue-500'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <TwitterIcon size={20} />
          </button>
          <button
            onClick={() => {
              setPlatform('instagram')
              closeSidebar()
            }}
            className={`p-2 rounded-full transition-colors ${
              platform === 'instagram'
                ? 'bg-pink-100 text-pink-500'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <InstagramIcon size={20} />
          </button>
          <button
            onClick={() => {
              setPlatform('facebook')
              closeSidebar()
            }}
            className={`p-2 rounded-full transition-colors ${
              platform === 'facebook'
                ? 'bg-indigo-100 text-indigo-500'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <FacebookIcon size={20} />
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1">
        <h2 className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">
          Navigation
        </h2>
        <ul className="space-y-2">
          <li>
            <Link
              to="/"
              onClick={closeSidebar}
              className={`flex items-center p-2 rounded-lg transition-colors ${
                isActive('/')
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <HomeIcon size={18} className="mr-2" />
              Dashboard
            </Link>
          </li>
          <li>
            <Link
              to="/analytics"
              onClick={closeSidebar}
              className={`flex items-center p-2 rounded-lg transition-colors ${
                isActive('/analytics')
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <BarChart2Icon size={18} className="mr-2" />
              Analytics
            </Link>
          </li>
          <li>
            <Link
              to="/scheduler"
              onClick={closeSidebar}
              className={`flex items-center p-2 rounded-lg transition-colors ${
                isActive('/scheduler')
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <CalendarIcon size={18} className="mr-2" />
              Scheduler
            </Link>
          </li>
          <li>
            <Link
              to="/ideas"
              onClick={closeSidebar}
              className={`flex items-center p-2 rounded-lg transition-colors ${
                isActive('/ideas')
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <BrainIcon size={18} className="mr-2" />
              Idea Generator
            </Link>
          </li>
          <li>
            <Link
              to="/accounts"
              onClick={closeSidebar}
              className={`flex items-center p-2 rounded-lg transition-colors ${
                isActive('/accounts')
                  ? 'bg-gray-100 text-gray-900'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <KeyIcon size={18} className="mr-2" />
              Connected Accounts
            </Link>
          </li>
        </ul>
      </nav>

      {/* Footer */}
      <div className="mt-auto pt-4 border-t border-gray-200">
        {/* User info and logout */}
        {user && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-700">{user.name || user.email}</p>
            <button
              onClick={() => {
                handleLogout()
                closeSidebar()
              }}
              className="flex items-center w-full mt-2 p-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOutIcon size={16} className="mr-2" />
              Logout
            </button>
          </div>
        )}
        
        {/* Current plan info */}
        <div className="bg-gray-100 p-3 rounded-lg">
          <h3 className="text-xs font-medium text-gray-700">Current Plan</h3>
          <p className="text-sm font-medium">Pro Plan</p>
          <div className="mt-2">
            <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: '65%' }}
              ></div>
            </div>
            <p className="text-xs text-gray-500 mt-1">65% of posts used</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <HamburgerButton />
      <Overlay />
      
      {/* Sidebar */}
      <div className={`
        w-64 bg-white border-r border-gray-200 h-screen overflow-y-auto z-40
        transition-transform duration-300 ease-in-out
        ${isMobile ? 'fixed top-0 left-0' : 'fixed top-0 left-0'}
        ${isMobile && !isOpen ? '-translate-x-full' : 'translate-x-0'}
      `}>
        {sidebarContent}
      </div>
      
      <div className="hidden md:block w-64 flex-shrink-0" />
    </>
  )
}

export default Sidebar