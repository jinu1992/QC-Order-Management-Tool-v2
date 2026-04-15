
import React, { useState, useEffect } from 'react';
import { ActivityLog, User, Role, ViewType, RolePermissions, ChannelConfig } from '../types';
import { ShieldCheckIcon, UserGroupIcon, LockClosedIcon, PencilIcon, TrashIcon, CheckCircleIcon, XCircleIcon, PlusIcon, AdminIcon, CogIcon, RefreshIcon, GlobeIcon, MailIcon } from './icons/Icons';
import { saveChannelConfig, saveSystemConfig, fetchSystemConfig, saveUserToSheet, deleteUserFromSheet } from '../services/api';

interface AdminPanelProps {
    logs: ActivityLog[];
    users: User[];
    setUsers: React.Dispatch<React.SetStateAction<User[]>>;
    rolePermissions: RolePermissions;
    setRolePermissions: React.Dispatch<React.SetStateAction<RolePermissions>>;
    addLog: (action: string, details: string) => void;
    currentUser: User;
    channelConfigs: ChannelConfig[];
    onSync: () => void;
    activeTab: 'users' | 'roles' | 'channels' | 'integrations' | 'logs';
    setActiveTab: (tab: 'users' | 'roles' | 'channels' | 'integrations' | 'logs') => void;
    addNotification: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

const inputClassName = "mt-1 block w-full rounded-lg border border-gray-300 bg-white text-gray-900 shadow-sm focus:border-partners-green focus:ring-partners-green sm:text-sm py-3 px-3";
const disabledInputClassName = "mt-1 block w-full rounded-lg border border-gray-300 bg-gray-100 text-gray-500 shadow-sm sm:text-sm py-3 px-3 cursor-not-allowed";

// Sub-component: User Modal
interface UserModalProps {
    user?: User;
    onClose: () => void;
    onSave: (user: User) => void;
    isSaving?: boolean;
}

const UserModal: React.FC<UserModalProps> = ({ user, onClose, onSave, isSaving }) => {
    const [formData, setFormData] = useState<Partial<User>>(user || {
        name: '', email: '', contactNumber: '', role: 'Limited Access', avatarInitials: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSave = () => {
        if (!formData.name || !formData.email || !formData.role) return;
        
        const initials = formData.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        
        onSave({
            id: user?.id || Date.now().toString(),
            name: formData.name,
            email: formData.email,
            contactNumber: formData.contactNumber || '',
            role: formData.role as Role,
            avatarInitials: initials
        });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="p-6 border-b">
                    <h3 className="text-lg font-semibold text-gray-800">{user ? 'Edit User' : 'Create New User'}</h3>
                </div>
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Full Name</label>
                        <input name="name" value={formData.name} onChange={handleChange} className={inputClassName} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input name="email" type="email" value={formData.email} onChange={handleChange} className={inputClassName} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Contact Number</label>
                        <input name="contactNumber" value={formData.contactNumber} onChange={handleChange} className={inputClassName} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Role</label>
                        <select name="role" value={formData.role} onChange={handleChange} className={inputClassName}>
                            <option value="Admin">Admin</option>
                            <option value="Key Account Manager">Key Account Manager</option>
                            <option value="Finance Manager">Finance Manager</option>
                            <option value="Supply Chain Manager">Supply Chain Manager</option>
                            <option value="Limited Access">Limited Access</option>
                        </select>
                    </div>
                </div>
                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-medium text-white bg-partners-green border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSaving && <RefreshIcon className="h-4 w-4 animate-spin"/>}
                        {isSaving ? 'Saving...' : 'Save User'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Sub-component: Channel Modal
interface ChannelModalProps {
    channel?: ChannelConfig;
    onClose: () => void;
    onSave: (config: ChannelConfig) => void;
}

const ChannelModal: React.FC<ChannelModalProps> = ({ channel, onClose, onSave }) => {
    const [formData, setFormData] = useState<ChannelConfig>(channel || {
        id: '',
        channelName: '',
        status: 'Active',
        sourceEmail: '',
        searchKeyword: '',
        minOrderThreshold: 0,
        pocName: '',
        pocEmail: '',
        pocPhone: '',
        appointmentTo: '',
        appointmentCc: ''
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleSave = () => {
        if (!formData.channelName) return;
        onSave({ ...formData, id: formData.channelName }); // Ensure ID is set
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b sticky top-0 bg-white z-10">
                    <h3 className="text-lg font-semibold text-gray-800">{channel ? 'Edit Channel' : 'Add New Channel'}</h3>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Channel Name (Unique ID)</label>
                        <input name="channelName" value={formData.channelName} onChange={handleChange} disabled={!!channel} className={channel ? disabledInputClassName : inputClassName} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Status</label>
                        <select name="status" value={formData.status} onChange={handleChange} className={inputClassName}>
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                        </select>
                    </div>
                    <div>
                         <label className="block text-sm font-medium text-gray-700">Min Order Threshold (₹)</label>
                         <input type="number" name="minOrderThreshold" value={formData.minOrderThreshold} onChange={handleChange} className={inputClassName} />
                    </div>

                    <div className="col-span-1 md:col-span-2">
                         <h4 className="text-sm font-semibold text-gray-600 mb-2 mt-2 border-b pb-1 flex items-center gap-2"><MailIcon className="h-4 w-4"/> Appointment Email Configuration</h4>
                    </div>
                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Recipient Email(s) - To</label>
                        <textarea 
                            name="appointmentTo" 
                            rows={2}
                            value={formData.appointmentTo || ''} 
                            onChange={handleChange} 
                            placeholder="email1@domain.com, email2@domain.com" 
                            className={inputClassName} 
                        />
                        <p className="text-[10px] text-gray-400 mt-1">Separate multiple emails with a comma.</p>
                    </div>
                    <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Recipient Email(s) - CC</label>
                        <textarea 
                            name="appointmentCc" 
                            rows={2}
                            value={formData.appointmentCc || ''} 
                            onChange={handleChange} 
                            placeholder="finance@cubelelo.com, logistics@cubelelo.com" 
                            className={inputClassName} 
                        />
                    </div>

                    <div className="col-span-1 md:col-span-2">
                         <h4 className="text-sm font-semibold text-gray-600 mb-2 mt-4 border-b pb-1">Integration Details</h4>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Source Email</label>
                        <input name="sourceEmail" value={formData.sourceEmail} onChange={handleChange} placeholder="orders@channel.com" className={inputClassName} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Search Keyword</label>
                        <input name="searchKeyword" value={formData.searchKeyword} onChange={handleChange} placeholder="Subject contains..." className={inputClassName} />
                    </div>
                     <div className="col-span-1 md:col-span-2">
                         <h4 className="text-sm font-semibold text-gray-600 mb-2 mt-2 border-b pb-1">POC Details</h4>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">POC Name</label>
                        <input name="pocName" value={formData.pocName} onChange={handleChange} className={inputClassName} />
                    </div>
                    <div>
                         <label className="block text-sm font-medium text-gray-700">POC Email</label>
                        <input name="pocEmail" value={formData.pocEmail} onChange={handleChange} className={inputClassName} />
                    </div>
                </div>
                <div className="px-6 py-4 bg-gray-50 border-t sticky bottom-0 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-partners-green border border-transparent rounded-md hover:bg-green-700">Save Configuration</button>
                </div>
            </div>
        </div>
    );
}

const AdminPanel: React.FC<AdminPanelProps> = ({ logs, users, setUsers, rolePermissions, setRolePermissions, addLog, currentUser, channelConfigs, onSync, activeTab, setActiveTab, addNotification }) => {
    const [userModal, setUserModal] = useState<{ isOpen: boolean, user?: User }>({ isOpen: false });
    const [isSavingUser, setIsSavingUser] = useState(false);
    
    // Channel Config State
    const [channelModal, setChannelModal] = useState<{ isOpen: boolean, channel?: ChannelConfig }>({ isOpen: false });

    // System Config State
    const [systemConfig, setSystemConfig] = useState({ easyecom_url: '', easyecom_token: '', easyecom_email: '', nimbus_notification_email: '', nimbus_to_emails: '', nimbus_cc_emails: '' });
    const [configLoading, setConfigLoading] = useState(false);

    useEffect(() => {
        if (activeTab === 'integrations') {
            loadSystemConfig();
        }
    }, [activeTab]);

    const loadSystemConfig = async () => {
        setConfigLoading(true);
        const config = await fetchSystemConfig();
        if (config) {
            setSystemConfig({
                easyecom_url: config['easyecom_url'] || 'https://api.easyecom.io/orders/create',
                easyecom_token: config['easyecom_token'] || '',
                easyecom_email: config['easyecom_email'] || '',
                nimbus_notification_email: config['nimbus_notification_email'] || '',
                nimbus_to_emails: config['nimbus_to_emails'] || '',
                nimbus_cc_emails: config['nimbus_cc_emails'] || ''
            });
        }
        setConfigLoading(false);
    };

    const handleSaveSystemConfig = async () => {
        setConfigLoading(true);
        try {
            const res = await saveSystemConfig(systemConfig);
            if (res.status === 'success') {
                addLog('System Config', 'Updated EasyEcom integration credentials');
                addNotification(res.message || 'Configuration saved successfully.', 'success');
            } else {
                addNotification(res.message || 'Failed to save configuration.', 'error');
            }
        } catch (e) {
            addNotification('Error saving configuration', 'error');
        } finally {
            setConfigLoading(false);
        }
    };

    const handleSaveUser = async (userData: User) => {
        setIsSavingUser(true);
        try {
            const res = await saveUserToSheet(userData);
            if (res.status === 'success') {
                if (userModal.user) {
                    setUsers(prev => prev.map(u => u.id === userData.id ? userData : u));
                    addLog('Update User', `Updated details for user ${userData.name}`);
                } else {
                    setUsers(prev => [...prev, userData]);
                    addLog('Create User', `Created new user ${userData.name} with role ${userData.role}`);
                }
                addNotification(res.message || 'User saved successfully.', 'success');
                setUserModal({ isOpen: false });
                onSync(); // Trigger global sync to ensure consistency
            } else {
                addNotification(res.message || 'Failed to save user.', 'error');
            }
        } catch (e) {
            addNotification('Network error saving user.', 'error');
        } finally {
            setIsSavingUser(false);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (confirm('Are you sure you want to delete this user?')) {
            const user = users.find(u => u.id === userId);
            try {
                const res = await deleteUserFromSheet(userId);
                if (res.status === 'success') {
                    setUsers(prev => prev.filter(u => u.id !== userId));
                    addLog('Delete User', `Deleted user ${user?.name}`);
                    addNotification(res.message || 'User deleted successfully.', 'success');
                } else {
                    addNotification(res.message || 'Failed to delete user.', 'error');
                }
            } catch (e) {
                addNotification('Network error deleting user.', 'error');
            }
        }
    };

    const handleSaveChannel = async (config: ChannelConfig) => {
        // Close modal first
        setChannelModal({ isOpen: false });
        addLog('Update Channel', `Saving configuration for ${config.channelName}...`);

        // API Call
        try {
            const res = await saveChannelConfig(config);
            if (res.status === 'success') {
                addLog('Success', `Configuration saved for ${config.channelName}. Refreshing data...`);
                addNotification(res.message || `Configuration saved for ${config.channelName}.`, 'success');
                onSync(); // Trigger global refresh
            } else {
                addNotification(res.message || 'Failed to save to Google Sheet.', 'error');
            }
        } catch (e) {
            console.error(e);
            addNotification('Network error saving channel config.', 'error');
        }
    };

    const handlePermissionChange = (role: string, view: ViewType) => {
        setRolePermissions(prev => {
            const currentPermissions = prev[role] || [];
            const hasPermission = currentPermissions.includes(view);
            let newPermissions;
            if (hasPermission) {
                newPermissions = currentPermissions.filter(p => p !== view);
            } else {
                newPermissions = [...currentPermissions, view];
            }
            return { ...prev, [role]: newPermissions };
        });
    };

    const allViews: ViewType[] = ['Dashboard', 'Purchase Orders', 'POC Verification', 'Appointments', 'Sales Orders', 'GRN / POD', 'Reports', 'Finance', 'Inventory', 'Admin'];

    return (
        <>
            {userModal.isOpen && (
                <UserModal 
                    user={userModal.user} 
                    onClose={() => setUserModal({ isOpen: false })} 
                    onSave={handleSaveUser} 
                    isSaving={isSavingUser}
                />
            )}
            {channelModal.isOpen && (
                <ChannelModal
                    channel={channelModal.channel}
                    onClose={() => setChannelModal({ isOpen: false })}
                    onSave={handleSaveChannel}
                />
            )}

            <div className="p-4 sm:p-6 lg:p-8 flex-1">
                {/* Tabs */}
                <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
                    <button 
                        onClick={() => setActiveTab('users')}
                        className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'users' ? 'border-partners-green text-partners-green' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <UserGroupIcon className="h-4 w-4" /> Users
                    </button>
                    <button 
                         onClick={() => setActiveTab('roles')}
                         className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'roles' ? 'border-partners-green text-partners-green' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <LockClosedIcon className="h-4 w-4" /> Roles & Permissions
                    </button>
                    <button 
                         onClick={() => setActiveTab('channels')}
                         className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'channels' ? 'border-partners-green text-partners-green' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <CogIcon className="h-4 w-4" /> Channel Config
                    </button>
                    <button 
                         onClick={() => setActiveTab('integrations')}
                         className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'integrations' ? 'border-partners-green text-partners-green' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <GlobeIcon className="h-4 w-4" /> Integrations
                    </button>
                    <button 
                         onClick={() => setActiveTab('logs')}
                         className={`px-4 py-2 text-sm font-medium border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'logs' ? 'border-partners-green text-partners-green' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <ShieldCheckIcon className="h-4 w-4" /> Activity Logs
                    </button>
                </div>

                {/* Content */}
                <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                    {activeTab === 'users' && (
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-semibold text-gray-800">User Management</h3>
                                <button onClick={() => setUserModal({ isOpen: true })} className="flex items-center gap-2 px-4 py-2 bg-partners-green text-white text-sm font-medium rounded-lg hover:bg-green-700 shadow-sm transition-all active:scale-95">
                                    <PlusIcon className="h-4 w-4" /> Add User
                                </button>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-gray-600">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3">User</th>
                                            <th className="px-6 py-3">Contact</th>
                                            <th className="px-6 py-3">Role</th>
                                            <th className="px-6 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {users.map(user => (
                                            <tr key={user.id} className="border-b hover:bg-gray-50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                                                            {user.avatarInitials}
                                                        </div>
                                                        <div>
                                                            <p className="font-medium text-gray-900">{user.name}</p>
                                                            <p className="text-xs text-gray-500">{user.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">{user.contactNumber}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                                        user.role === 'Admin' ? 'bg-purple-100 text-purple-800' :
                                                        user.role === 'Limited Access' ? 'bg-gray-100 text-gray-800' :
                                                        'bg-blue-100 text-blue-800'
                                                    }`}>
                                                        {user.role}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button onClick={() => setUserModal({ isOpen: true, user })} className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors">
                                                            <PencilIcon className="h-4 w-4" />
                                                        </button>
                                                        {user.id !== currentUser.id && ( // Prevent self-deletion
                                                            <button onClick={() => handleDeleteUser(user.id)} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                                                                <TrashIcon className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {activeTab === 'roles' && (
                        <div className="p-6">
                             <div className="mb-4">
                                <h3 className="text-lg font-semibold text-gray-800">Role Permissions</h3>
                                <p className="text-sm text-gray-500">Define which sections each role can access.</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-gray-600">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                        <tr>
                                            <th className="px-4 py-3 bg-gray-50 sticky left-0 z-10">Section / Role</th>
                                            {Object.keys(rolePermissions).map(role => (
                                                <th key={role} className="px-4 py-3 text-center">{role}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allViews.map(view => (
                                            <tr key={view} className="border-b hover:bg-gray-50">
                                                <td className="px-4 py-3 font-medium text-gray-900 bg-gray-50 sticky left-0 z-10">{view}</td>
                                                {Object.keys(rolePermissions).map(role => {
                                                    const isAllowed = rolePermissions[role].includes(view);
                                                    const isAdmin = role === 'Admin';
                                                    return (
                                                        <td key={role} className="px-4 py-3 text-center">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={isAllowed} 
                                                                onChange={() => !isAdmin && handlePermissionChange(role, view)}
                                                                disabled={isAdmin} // Admin always has full access
                                                                className={`h-4 w-4 rounded border-gray-300 ${isAdmin ? 'text-gray-400 cursor-not-allowed' : 'text-partners-green focus:ring-partners-green cursor-pointer'}`}
                                                            />
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                             <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-xs text-yellow-800 flex items-start gap-2">
                                <AdminIcon className="h-4 w-4 mt-0.5" />
                                <span>Note: The 'Admin' role is locked to have full access to all sections to prevent system lockout. Changes to other roles are saved automatically.</span>
                            </div>
                        </div>
                    )}

                     {activeTab === 'channels' && (
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-800">Channel Configurations</h3>
                                    <p className="text-sm text-gray-500">Manage integration details and thresholds for sales channels.</p>
                                </div>
                                <div className="flex gap-2">
                                     <button onClick={onSync} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors" title="Refresh">
                                        <RefreshIcon className="h-5 w-5" />
                                    </button>
                                    <button onClick={() => setChannelModal({ isOpen: true })} className="flex items-center gap-2 px-4 py-2 bg-partners-green text-white text-sm font-medium rounded-lg hover:bg-green-700 shadow-sm transition-all active:scale-95">
                                        <PlusIcon className="h-4 w-4" /> Add Channel
                                    </button>
                                </div>
                            </div>
                            
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-gray-600">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                        <tr>
                                            <th className="px-6 py-3">Channel Name</th>
                                            <th className="px-6 py-3">Status</th>
                                            <th className="px-6 py-3">Threshold</th>
                                            <th className="px-6 py-3">Source</th>
                                            <th className="px-6 py-3">Recipient Emails (To)</th>
                                            <th className="px-6 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {channelConfigs.length === 0 ? (
                                            <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No channels configured.</td></tr>
                                        ) : (
                                            channelConfigs.map(channel => (
                                                <tr key={channel.channelName} className="border-b hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 font-medium text-gray-900">{channel.channelName}</td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${channel.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                            {channel.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">₹{channel.minOrderThreshold.toLocaleString('en-IN')}</td>
                                                    <td className="px-6 py-4 text-xs">
                                                        <div>{channel.sourceEmail}</div>
                                                        <div className="text-gray-400">Key: {channel.searchKeyword}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-xs">
                                                        <div className="truncate max-w-[200px]" title={channel.appointmentTo}>{channel.appointmentTo || 'Not set'}</div>
                                                        <div className="text-gray-400 truncate max-w-[200px]" title={channel.appointmentCc}>{channel.appointmentCc ? `CC: ${channel.appointmentCc}` : ''}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button onClick={() => setChannelModal({ isOpen: true, channel })} className="text-partners-green hover:underline font-medium">Edit</button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'integrations' && (
                        <div className="p-6">
                            <div className="mb-6">
                                <h3 className="text-lg font-semibold text-gray-800">System Integrations</h3>
                                <p className="text-sm text-gray-500">Configure connection details for external platforms.</p>
                            </div>
                            
                            <div className="max-w-2xl bg-gray-50 p-6 rounded-lg border border-gray-200">
                                <h4 className="font-semibold text-gray-700 flex items-center gap-2 mb-4">
                                    <GlobeIcon className="h-5 w-5 text-partners-green"/> EasyEcom API Settings
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">API Endpoint URL</label>
                                        <input 
                                            type="text" 
                                            className={inputClassName}
                                            value={systemConfig.easyecom_url}
                                            onChange={e => setSystemConfig({...systemConfig, easyecom_url: e.target.value})}
                                            placeholder="https://api.easyecom.io/..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Account Email (if required)</label>
                                        <input 
                                            type="email" 
                                            className={inputClassName}
                                            value={systemConfig.easyecom_email}
                                            onChange={e => setSystemConfig({...systemConfig, easyecom_email: e.target.value})}
                                            placeholder="api@cubelelo.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Bearer Token / API Key</label>
                                        <input 
                                            type="password" 
                                            className={inputClassName}
                                            value={systemConfig.easyecom_token}
                                            onChange={e => setSystemConfig({...systemConfig, easyecom_token: e.target.value})}
                                            placeholder="**************************"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Credentials are stored securely in the backend 'System_Config' sheet.</p>
                                    </div>
                                </div>
                                <h4 className="font-semibold text-gray-700 flex items-center gap-2 mb-4 mt-8">
                                    <MailIcon className="h-5 w-5 text-partners-green"/> Nimbus Integration & Email Reports
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Daily Summary Report — To (primary recipients)</label>
                                        <textarea 
                                            rows={2}
                                            className={inputClassName}
                                            value={systemConfig.nimbus_to_emails || systemConfig.nimbus_notification_email}
                                            onChange={e => setSystemConfig({...systemConfig, nimbus_to_emails: e.target.value, nimbus_notification_email: e.target.value})}
                                            placeholder="admin@example.com, ops@example.com"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Separate multiple email addresses with a comma. Four-hourly Nimbus summaries will be sent to these recipients.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Daily Summary Report — CC</label>
                                        <textarea 
                                            rows={2}
                                            className={inputClassName}
                                            value={systemConfig.nimbus_cc_emails}
                                            onChange={e => setSystemConfig({...systemConfig, nimbus_cc_emails: e.target.value})}
                                            placeholder="finance@example.com, manager@example.com"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">Optional. Separate multiple CC addresses with a comma.</p>
                                    </div>
                                    <div className="flex justify-end pt-4">
                                         <button 
                                            onClick={handleSaveSystemConfig}
                                            disabled={configLoading}
                                            className="px-6 py-2 bg-partners-green text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 shadow-sm active:scale-95 transition-all"
                                        >
                                            {configLoading ? 'Saving...' : 'Save Configuration'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'logs' && (
                        <div className="p-0">
                             <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-gray-600">
                                    <thead className="text-[11px] text-gray-500 uppercase bg-gray-50/50">
                                        <tr>
                                            <th className="px-6 py-4">Timestamp</th>
                                            <th className="px-6 py-4">User</th>
                                            <th className="px-6 py-4">Action</th>
                                            <th className="px-6 py-4">Details</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {logs.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic">No activity logs found.</td>
                                            </tr>
                                        ) : (
                                            logs.map(log => (
                                                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 whitespace-nowrap text-gray-400 text-xs font-mono">{log.timestamp}</td>
                                                    <td className="px-6 py-4">
                                                        <span className="font-bold text-gray-900">{log.user}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2 py-1 text-[10px] font-bold uppercase rounded bg-blue-50 text-blue-600 border border-blue-100 tracking-wider">
                                                            {log.action}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-600 text-xs leading-relaxed max-w-md">{log.details}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default AdminPanel;
