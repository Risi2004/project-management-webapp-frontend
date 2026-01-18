import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import enUS from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../App.css'; // We will put custom overrides here
import { useMemo } from 'react';

const locales = {
    'en-US': enUS,
};

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek,
    getDay,
    locales,
});

const ProjectCalendar = ({ tasks, onEventClick }) => {

    const events = useMemo(() => {
        return tasks
            .filter(task => task.startDate || task.dueDate) // Only tasks with dates
            .map(task => {
                const start = task.startDate ? new Date(task.startDate) : new Date(task.dueDate);
                const end = task.dueDate ? new Date(task.dueDate) : start;

                // Adjust for end of day if it's the same day or make it inclusive? 
                // RBC treats 'end' as exclusive for allDay events in some views, but usually inclusive for 'month'.
                // Let's assume input is "YYYY-MM-DD".
                // We want the event to span the full day.

                // Fix timezone offset issues by parsing explicitly if needed, but new Date("YYYY-MM-DD") is UTC in some envs, local in others.
                // Safest to just use new Date(year, month, day).

                return {
                    title: `${task.taskId}: ${task.description.substring(0, 20)}${task.description.length > 20 ? '...' : ''}`,
                    allDay: true,
                    start,
                    end,
                    resource: task,
                    status: task.status,
                    priority: task.priority
                };
            });
    }, [tasks]);

    const eventStyleGetter = (event) => {
        let backgroundColor = '#3b82f6'; // default blue
        if (event.priority === 'High') backgroundColor = '#ef4444';
        else if (event.priority === 'Medium') backgroundColor = '#f59e0b';
        else if (event.priority === 'Low') backgroundColor = '#10b981';

        if (event.status === 'Completed') backgroundColor = '#6b7280'; // gray out completed

        const style = {
            backgroundColor,
            borderRadius: '4px',
            opacity: 0.8,
            color: 'white',
            border: '0px',
            display: 'block'
        };
        return { style };
    };

    return (
        <div className="calendar-container animate-fade-up">
            <Calendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                style={{ height: '100%', minHeight: '600px' }}
                eventPropGetter={eventStyleGetter}
                onSelectEvent={(event) => onEventClick && onEventClick(event.resource)}
                tooltipAccessor="title"
                views={['month']}
                defaultView='month'
            />
        </div>
    );
};

export default ProjectCalendar;
