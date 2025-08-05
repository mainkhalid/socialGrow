import React, { useState } from 'react';
import { CalendarIcon, PlusIcon, TrashIcon, Clock10Icon } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';

const Scheduler = () => {
  const { platform } = usePlatform();
  const [showModal, setShowModal] = useState(false);
  const [newPost, setNewPost] = useState({
    content: '',
    date: '',
    time: '',
    image: '',
  });
  const [scheduledPosts, setScheduledPosts] = useState([
    {
      id: 1,
      content: 'Excited to announce our new feature release! Check it out today.',
      date: '2023-05-15',
      time: '09:00',
      platform: 'twitter',
    },
    {
      id: 2,
      content: 'Behind the scenes look at our design process. #DesignThinking',
      date: '2023-05-16',
      time: '12:00',
      platform: 'instagram',
      image: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=1740&q=80',
    },
    {
      id: 3,
      content: 'Join us for our upcoming webinar on social media strategies!',
      date: '2023-05-18',
      time: '15:00',
      platform: 'facebook',
    },
  ]);

  const platformNames = {
    twitter: 'X (Twitter)',
    instagram: 'Instagram',
    facebook: 'Facebook',
  };

  const platformIcons = {
    twitter: (
      <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
        X
      </div>
    ),
    instagram: (
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white font-bold">
        IG
      </div>
    ),
    facebook: (
      <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">
        FB
      </div>
    ),
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setScheduledPosts([
      ...scheduledPosts,
      {
        id: Date.now(),
        content: newPost.content,
        date: newPost.date,
        time: newPost.time,
        platform,
        image: newPost.image || undefined,
      },
    ]);
    setNewPost({
      content: '',
      date: '',
      time: '',
      image: '',
    });
    setShowModal(false);
  };

  const deletePost = (id) => {
    setScheduledPosts(scheduledPosts.filter((post) => post.id !== id));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Post Scheduler</h1>
          <p className="text-gray-600">
            Schedule posts for{' '}
            <span className="font-medium">{platformNames[platform]}</span>
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className={`px-4 py-2 rounded-lg flex items-center 
            ${platform === 'twitter' ? 'bg-blue-500 hover:bg-blue-600' : platform === 'instagram' ? 'bg-pink-500 hover:bg-pink-600' : 'bg-indigo-500 hover:bg-indigo-600'} text-white`}
        >
          <PlusIcon size={18} className="mr-1" />
          New Post
        </button>
      </header>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-medium">Upcoming Posts</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {scheduledPosts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <CalendarIcon size={48} className="mx-auto mb-4 text-gray-300" />
              <p>No posts scheduled</p>
              <button
                onClick={() => setShowModal(true)}
                className="mt-2 text-sm text-blue-500 hover:text-blue-600"
              >
                Schedule your first post
              </button>
            </div>
          ) : (
            scheduledPosts.map((post) => (
              <div key={post.id} className="p-4 flex items-start">
                <div className="mr-4">{platformIcons[post.platform]}</div>
                <div className="flex-1">
                  <p className="text-gray-800 mb-2">{post.content}</p>
                  {post.image && (
                    <div className="mb-2 rounded-lg overflow-hidden w-24 h-24">
                      <img
                        src={post.image}
                        alt="Post attachment"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex items-center text-sm text-gray-500">
                    <CalendarIcon size={14} className="mr-1" />
                    <span className="mr-3">
                      {new Date(post.date).toLocaleDateString()}
                    </span>
                    <Clock10Icon size={14} className="mr-1" />
                    <span>{post.time}</span>
                  </div>
                </div>
                <button
                  onClick={() => deletePost(post.id)}
                  className="p-2 text-gray-400 hover:text-red-500"
                >
                  <TrashIcon size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full">
            <h2 className="text-xl font-bold mb-4">Schedule New Post</h2>
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Content
                </label>
                <textarea
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={4}
                  value={newPost.content}
                  onChange={(e) =>
                    setNewPost({
                      ...newPost,
                      content: e.target.value,
                    })
                  }
                  required
                ></textarea>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={newPost.date}
                    onChange={(e) =>
                      setNewPost({
                        ...newPost,
                        date: e.target.value,
                      })
                    }
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={newPost.time}
                    onChange={(e) =>
                      setNewPost({
                        ...newPost,
                        time: e.target.value,
                      })
                    }
                    required
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image URL (optional)
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  value={newPost.image}
                  onChange={(e) =>
                    setNewPost({
                      ...newPost,
                      image: e.target.value,
                    })
                  }
                  placeholder="https://example.com/image.jpg"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-lg text-white
                    ${platform === 'twitter' ? 'bg-blue-500 hover:bg-blue-600' : platform === 'instagram' ? 'bg-pink-500 hover:bg-pink-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}
                >
                  Schedule Post
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Scheduler;