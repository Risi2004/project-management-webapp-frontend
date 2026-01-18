import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

const ProjectAnalytics = ({ tasks, project }) => {

    const statusData = useMemo(() => {
        const counts = { Pending: 0, 'In Progress': 0, Completed: 0 };
        tasks.forEach(t => {
            if (counts[t.status] !== undefined) {
                counts[t.status]++;
            } else {
                // Handle edge case or other statuses if any
                counts[t.status] = (counts[t.status] || 0) + 1;
            }
        });
        return Object.keys(counts).map(key => ({ name: key, value: counts[key] }));
    }, [tasks]);

    const workloadData = useMemo(() => {
        const counts = {};
        tasks.forEach(t => {
            const assigneeId = t.assignedTo;
            if (assigneeId) {
                counts[assigneeId] = (counts[assigneeId] || 0) + 1;
            } else {
                counts['Unassigned'] = (counts['Unassigned'] || 0) + 1;
            }
        });

        return Object.keys(counts).map(uid => {
            let name = 'Unassigned';
            if (uid !== 'Unassigned') {
                if (uid === project.ownerId) {
                    name = project.ownerName || 'Owner';
                } else {
                    const member = project.memberDetails?.find(m => m.uid === uid);
                    name = member ? (member.name || member.email) : 'Unknown';
                }
            }
            return { name, tasks: counts[uid] };
        });
    }, [tasks, project]);

    const overallProgress = useMemo(() => {
        if (tasks.length === 0) return 0;
        const totalPercent = tasks.reduce((acc, curr) => acc + (parseInt(curr.percentDone) || 0), 0);
        return Math.round(totalPercent / tasks.length);
    }, [tasks]);

    return (
        <div className="analytics-container animate-fade-up" style={{ padding: '1rem', color: 'white' }}>
            <h2 style={{ marginBottom: '2rem' }}>Project Analytics</h2>

            {/* Progress Bar Section */}
            <div style={{ marginBottom: '3rem', background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '1rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', color: 'var(--color-text-muted)' }}>Overall Completion</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ flex: 1, height: '24px', background: 'rgba(255,255,255,0.1)', borderRadius: '12px', overflow: 'hidden' }}>
                        <div style={{
                            width: `${overallProgress}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                            transition: 'width 1s ease-in-out',
                            borderRadius: '12px'
                        }}></div>
                    </div>
                    <span style={{ fontWeight: 'bold', fontSize: '1.5rem', minWidth: '60px' }}>{overallProgress}%</span>
                </div>
            </div>

            <div className="charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '2rem' }}>

                {/* Status Pie Chart */}
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '1rem', minHeight: '400px' }}>
                    <h3 style={{ marginBottom: '1rem', textAlign: 'center' }}>Task Status Distribution</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={statusData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                fill="#8884d8"
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {statusData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                                itemStyle={{ color: '#fff' }}
                            />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Workload Bar Chart */}
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '1rem', minHeight: '400px' }}>
                    <h3 style={{ marginBottom: '1rem', textAlign: 'center' }}>Member Workload</h3>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={workloadData}>
                            <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                            <YAxis stroke="var(--color-text-muted)" allowDecimals={false} tickLine={false} axisLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#fff' }}
                                itemStyle={{ color: '#fff' }}
                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            />
                            <Legend />
                            <Bar dataKey="tasks" fill="var(--color-primary)" radius={[4, 4, 0, 0]} name="Tasks Assigned" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

export default ProjectAnalytics;
